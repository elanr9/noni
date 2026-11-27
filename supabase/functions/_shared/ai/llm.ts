// The single entry point for Claude calls in new AI code. Structured outputs
// instead of prose JSON, adaptive thinking left on, typed errors, explicit
// stop_reason handling, and one ai_runs row per call.
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Tier = 'writer' | 'fast' | 'research';
export type Effort = 'low' | 'medium' | 'high';
export type JsonSchema = { [key: string]: unknown };

const TIERS: Record<Tier, { env: string; model: string; effort: Effort }> = {
  // Briefs, edit plans, reference analysis, brain synthesis.
  writer: { env: 'NONI_AI_WRITER_MODEL', model: 'claude-opus-5-5', effort: 'medium' },
  // Classification, extraction, cleanup.
  fast: { env: 'NONI_AI_FAST_MODEL', model: 'claude-haiku-5-5', effort: 'low' },
  // Web search research.
  research: { env: 'NONI_AI_RESEARCH_MODEL', model: 'claude-opus-5-5', effort: 'medium' },
};

export function modelFor(tier: Tier): string {
  return Deno.env.get(TIERS[tier].env) ?? TIERS[tier].model;
}

// ---------------------------------------------------------------- errors

/** Base of every failure this module throws. retryable: trying the same call again later can succeed. */
export class LlmError extends Error {
  retryable: boolean;
  status?: number;
  requestId?: string | null;
  constructor(
    message: string,
    opts: { retryable?: boolean; status?: number; requestId?: string | null; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = new.target.name;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
    this.requestId = opts.requestId;
  }
}
/** A schema passed to generate() that structured outputs would reject. */
export class LlmSchemaError extends LlmError {}
/** stop_reason max_tokens: the output was cut off. Raise maxTokens or lower effort. */
export class LlmTruncatedError extends LlmError {}
/** stop_reason refusal: a safety classifier declined (after any server-side fallback). */
export class LlmRefusalError extends LlmError {
  category: string | null;
  constructor(category: string | null, explanation?: string | null) {
    super(`Claude declined the request (${category ?? 'no category'})${explanation ? `: ${explanation}` : ''}`);
    this.category = category;
  }
}
/** The response had no usable text, or did not match the schema's top level. */
export class LlmInvalidOutputError extends LlmError {}
/** 4xx the caller has to fix: bad request, auth, billing, permission, unknown model, too large. */
export class LlmRequestError extends LlmError {}
export class LlmRateLimitError extends LlmError {}
/** 5xx and 529 after the SDK's own retries. */
export class LlmServerError extends LlmError {}
export class LlmTimeoutError extends LlmError {}
export class LlmConnectionError extends LlmError {}

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (!(err instanceof Anthropic.APIError)) {
    return new LlmError(err instanceof Error ? err.message : String(err), { cause: err });
  }
  const base = { status: err.status, requestId: err.requestID, cause: err };
  // The API marks the 429s and 5xxs that will not clear on retry (a spend cap, for one).
  const retryable = err.headers?.get('x-should-retry') !== 'false';
  if (err instanceof Anthropic.RateLimitError) return new LlmRateLimitError(err.message, { ...base, retryable });
  if (err instanceof Anthropic.InternalServerError) return new LlmServerError(err.message, { ...base, retryable });
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    // The only abort signal the SDK sees is this module's own deadline.
    return new LlmTimeoutError('Claude call timed out', { ...base, retryable: true });
  }
  if (err instanceof Anthropic.APIConnectionError) return new LlmConnectionError(err.message, { ...base, retryable: true });
  if (err instanceof Anthropic.RequestTimeoutError || err instanceof Anthropic.ConflictError) {
    return new LlmServerError(err.message, { ...base, retryable });
  }
  return new LlmRequestError(err.message, base);
}

// ---------------------------------------------------------------- schema

/**
 * Structured outputs need every object to set additionalProperties: false and
 * to list all of its properties in required. Throws LlmSchemaError naming the
 * first node that does not, so the mistake shows up here and not as a 400.
 */
export function assertStrictSchema(schema: unknown, path = '$'): void {
  if (Array.isArray(schema)) return schema.forEach((s, i) => assertStrictSchema(s, `${path}[${i}]`));
  if (!schema || typeof schema !== 'object') return;
  const node = schema as Record<string, unknown>;
  const props = node.properties as Record<string, unknown> | undefined;
  if (node.type === 'object' || props) {
    if (node.additionalProperties !== false) {
      throw new LlmSchemaError(`schema ${path}: object must set additionalProperties: false`);
    }
    const required = Array.isArray(node.required) ? node.required : [];
    const missing = Object.keys(props ?? {}).filter((k) => !required.includes(k));
    if (missing.length) {
      throw new LlmSchemaError(`schema ${path}: required must list every property, missing ${missing.join(', ')}`);
    }
  }
  for (const [key, child] of Object.entries(props ?? {})) assertStrictSchema(child, `${path}.${key}`);
  for (const key of ['items', 'anyOf', 'oneOf', 'allOf']) assertStrictSchema(node[key], `${path}.${key}`);
  for (const key of ['$defs', 'definitions']) {
    for (const [name, child] of Object.entries((node[key] as Record<string, unknown>) ?? {})) {
      assertStrictSchema(child, `${path}.${key}.${name}`);
    }
  }
}

// ---------------------------------------------------------------- cost

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};
export type LlmUsage = TokenCounts & {
  webSearches: number;
  /** Token cost only (web search fees are not included); null when a model is not in the price table. */
  costUsd: number | null;
};

type Price = { input: number; output: number; cacheRead: number };
// USD per million tokens. Cache writes (5 minute TTL) are 1.25x input.
const PRICES: Array<{ prefix: string; price: Price; long?: { over: number; price: Price } }> = [
  { prefix: 'claude-opus-5-5', price: { input: 4, output: 20, cacheRead: 0.2 } },
  {
    prefix: 'claude-haiku-5-5',
    price: { input: 0.1, output: 0.5, cacheRead: 0.01 },
    // Haiku 5.5 bills a second rate card when the prompt is over 100K tokens.
    long: { over: 100_000, price: { input: 0.5, output: 2.5, cacheRead: 0.05 } },
  },
];
const CACHE_WRITE_MULTIPLIER = 1.25;

export function estimateCostUsd(model: string, t: TokenCounts): number | null {
  const entry = PRICES.find((p) => model.startsWith(p.prefix));
  if (!entry) return null;
  const prompt = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
  const p = entry.long && prompt > entry.long.over ? entry.long.price : entry.price;
  return (
    (t.inputTokens * p.input +
      t.cacheWriteTokens * p.input * CACHE_WRITE_MULTIPLIER +
      t.cacheReadTokens * p.cacheRead +
      t.outputTokens * p.output) /
    1_000_000
  );
}

// ---------------------------------------------------------------- request

type StreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0];
type StreamOptions = Parameters<Anthropic['beta']['messages']['stream']>[1];
type Message = Anthropic.Beta.BetaMessage;

/** The slice of the SDK client this module calls; tests pass a fake. */
export interface LlmClient {
  beta: {
    messages: {
      stream(
        body: StreamParams,
        options?: StreamOptions,
      ): {
        finalMessage(): Promise<Message>;
        readonly request_id?: string | null;
        on?(event: 'text', listener: (delta: string, snapshot: string) => void): unknown;
      };
    };
  };
}

export type LlmImage =
  | { url: string }
  | { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' };

export type LlmDocument = { base64: string; title?: string };

export type LlmRequest = {
  /** Name of the job for ai_runs, e.g. 'brief.write'. */
  task: string;
  tier?: Tier;
  /** The stable task prompt. Nothing per company or per request in here. */
  system: string;
  /** Text blocks ordered most stable first (playbook, company brain, reference analysis). */
  context?: string[];
  /** The per-request content. */
  input: string;
  images?: LlmImage[];
  /** PDFs the model reads natively, pages and pictures included. */
  documents?: LlmDocument[];
  /**
   * Index of the context block the files follow. Set when several calls share
   * the same files and the context up to that block, so the files are read
   * from the cache: the block's breakpoint moves to the last file. Without it
   * the files sit after all context and are never cached.
   */
  filesAfter?: number;
  /** Called with each piece of the answer as it is written, and the whole answer so far. */
  onText?: (delta: string, snapshot: string) => void;
  effort?: Effort;
  maxTokens?: number;
  companyId?: string | null;
  timeoutMs?: number;
};

export type LlmDeps = {
  client?: LlmClient;
  /** Service client for ai_runs. Defaults to one built from env; null turns logging off. */
  supabase?: Pick<SupabaseClient, 'from'> | null;
};

export type LlmMeta = { usage: LlmUsage; model: string; runId: string };

const DEFAULT_MAX_TOKENS = 16000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// A declined request is re-run on Anthropic's recommended fallback model inside
// the same call. Haiku 5.5 has no server-side fallback: a refusal there surfaces
// as LlmRefusalError and the caller decides.
function fallbackParams(model: string): Pick<StreamParams, 'betas' | 'fallbacks'> {
  return /^claude-(opus-5|sonnet-5-5|fable-5-[12])/.test(model)
    ? { betas: [FALLBACK_BETA], fallbacks: 'default' }
    : {};
}

function systemBlocks(system: string): StreamParams['system'] {
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

/**
 * Cache layout (the cache is a prefix match; at most 4 breakpoints):
 *
 *   system:  [task prompt]            <- breakpoint 1: shared by every call of the task, across companies
 *   user:    [context 0] ... [n-1]    <- breakpoints 2-4, most stable block first
 *            [images]
 *            [input]                  <- per request, after the last breakpoint, never cached
 *
 * With up to 3 context blocks each one ends in a breakpoint, so a change in a
 * later block still reads everything before it. With more than 3, the first
 * two and the last are marked and the middle ones ride on the last. Context
 * sits in the user turn, not in system, because it is company data (some of
 * it scraped) and should not carry the authority of the system prompt.
 * Effort is part of the cached prefix: keep it fixed per task.
 */
export function buildRequest(
  req: Pick<LlmRequest, 'system' | 'context' | 'input' | 'images' | 'documents' | 'filesAfter'> & {
    model: string;
    effort: Effort;
    maxTokens: number;
    schema?: JsonSchema;
  },
): StreamParams {
  const context = (req.context ?? []).filter((text) => text.trim());
  const cached = { cache_control: { type: 'ephemeral' as const } };
  const files = [
    ...(req.documents ?? []).map((doc) => ({
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: doc.base64 },
      ...(doc.title ? { title: doc.title } : {}),
    })),
    ...(req.images ?? []).map((img) => ({
      type: 'image' as const,
      source: 'url' in img
        ? { type: 'url' as const, url: img.url }
        : { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
    })),
  ];
  // Files placed inside the context take the breakpoint of the block they follow.
  const after = files.length && req.filesAfter !== undefined && req.filesAfter >= 0 && req.filesAfter < context.length ? req.filesAfter : -1;
  const marked = (i: number) => i !== after && (context.length <= 3 || i < 2 || i === context.length - 1);
  const placed = after >= 0 ? files.map((f, i) => (i === files.length - 1 ? { ...f, ...cached } : f)) : files;
  const blocks = context.flatMap((text, i) => [
    { type: 'text' as const, text, ...(marked(i) ? cached : {}) },
    ...(i === after ? placed : []),
  ]);
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: req.effort,
      ...(req.schema ? { format: { type: 'json_schema' as const, schema: req.schema } } : {}),
    },
    system: systemBlocks(req.system),
    messages: [
      {
        role: 'user',
        content: [...blocks, ...(after >= 0 ? [] : files), { type: 'text' as const, text: req.input }],
      },
    ],
    ...fallbackParams(req.model),
  };
}

// ---------------------------------------------------------------- run + log

let defaultClient: LlmClient | undefined;
function clientFrom(deps: LlmDeps): LlmClient {
  if (deps.client) return deps.client;
  if (!defaultClient) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new LlmRequestError('ANTHROPIC_API_KEY not set');
    defaultClient = new Anthropic({ apiKey, maxRetries: 3 });
  }
  return defaultClient;
}

let defaultLogClient: Pick<SupabaseClient, 'from'> | null | undefined;
function logClientFrom(deps: LlmDeps): Pick<SupabaseClient, 'from'> | null {
  if (deps.supabase !== undefined) return deps.supabase;
  if (defaultLogClient === undefined) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    defaultLogClient = url && key ? createClient(url, key) : null;
    if (!defaultLogClient) console.warn('llm: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set, ai_runs logging is off');
  }
  return defaultLogClient;
}

type RunInfo = { task: string; tier: Tier; model: string; companyId?: string | null; timeoutMs: number };

/** One logical call (one or more requests): accumulates usage and what ai_runs needs. */
class Run {
  readonly id = crypto.randomUUID();
  readonly signal: AbortSignal;
  usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, costUsd: 0 };
  model: string;
  stopReason: string | null = null;
  requestId: string | null = null;

  constructor(readonly info: RunInfo, readonly client: LlmClient) {
    this.model = info.model;
    // One deadline for the whole call. The SDK's own timeout is per attempt,
    // so with retries it alone could run to four times this.
    this.signal = AbortSignal.timeout(info.timeoutMs);
  }

  /** Sends one request, records it, and turns the stop reasons that are failures into errors. */
  async send(body: StreamParams, onText?: LlmRequest['onText']): Promise<Message> {
    // Always streamed: a large max_tokens would otherwise hit HTTP timeouts.
    const stream = this.client.beta.messages.stream(body, { timeout: this.info.timeoutMs, signal: this.signal });
    if (onText) {
      stream.on?.('text', (delta, snapshot) => {
        try {
          onText(delta, snapshot);
        } catch (e) {
          console.error('llm: onText failed', e);
        }
      });
    }
    const message = await stream.finalMessage();
    const u = message.usage;
    const tokens: TokenCounts = {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    };
    // Priced at the model that answered; a fallback turn can under or over state it slightly.
    const cost = estimateCostUsd(message.model, tokens);
    this.usage = {
      inputTokens: this.usage.inputTokens + tokens.inputTokens,
      outputTokens: this.usage.outputTokens + tokens.outputTokens,
      cacheReadTokens: this.usage.cacheReadTokens + tokens.cacheReadTokens,
      cacheWriteTokens: this.usage.cacheWriteTokens + tokens.cacheWriteTokens,
      webSearches: this.usage.webSearches + (u.server_tool_use?.web_search_requests ?? 0),
      costUsd: cost === null || this.usage.costUsd === null ? null : this.usage.costUsd + cost,
    };
    this.model = message.model;
    this.stopReason = message.stop_reason;
    this.requestId = stream.request_id ?? null;

    if (message.stop_reason === 'refusal') {
      throw new LlmRefusalError(message.stop_details?.category ?? null, message.stop_details?.explanation);
    }
    if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
      throw new LlmTruncatedError(
        `Claude stopped at ${message.stop_reason} (max_tokens ${body.max_tokens}, ${tokens.outputTokens} output tokens)`,
      );
    }
    return message;
  }

  meta(): LlmMeta {
    return { usage: this.usage, model: this.model, runId: this.id };
  }
}

async function withRun<R>(info: RunInfo, deps: LlmDeps, fn: (run: Run) => Promise<R>): Promise<R & LlmMeta> {
  const started = Date.now();
  let run: Run | undefined;
  let error: LlmError | undefined;
  try {
    run = new Run(info, clientFrom(deps));
    return { ...(await fn(run)), ...run.meta() };
  } catch (err) {
    error = toLlmError(err);
    error.requestId ??= run?.requestId;
    throw error;
  } finally {
    logRun(deps, {
      ...(run ? { id: run.id } : {}),
      task: info.task,
      tier: info.tier,
      model: run?.model ?? info.model,
      company_id: info.companyId ?? null,
      input_tokens: run?.usage.inputTokens ?? 0,
      output_tokens: run?.usage.outputTokens ?? 0,
      cache_read_tokens: run?.usage.cacheReadTokens ?? 0,
      cache_write_tokens: run?.usage.cacheWriteTokens ?? 0,
      cost_usd: run?.usage.costUsd ?? null,
      latency_ms: Date.now() - started,
      stop_reason: run?.stopReason ?? null,
      error: error ? `${error.name}: ${error.message}`.slice(0, 2000) : null,
      request_id: error?.requestId ?? run?.requestId ?? null,
    });
  }
}

/** Fire and forget: a logging failure is printed, never thrown into the caller. */
function logRun(deps: LlmDeps, row: Record<string, unknown>): void {
  const write = (async () => {
    try {
      const { error } = (await logClientFrom(deps)?.from('ai_runs').insert(row)) ?? { error: null };
      if (error) console.error('llm: ai_runs insert failed', error.message);
    } catch (err) {
      console.error('llm: ai_runs insert failed', err);
    }
  })();
  // Keeps the edge worker alive for the insert after the response has gone out.
  (globalThis as { EdgeRuntime?: { waitUntil?(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil?.(write);
}

function runInfo(req: Pick<LlmRequest, 'task' | 'companyId' | 'timeoutMs'>, tier: Tier, timeoutMs: number): RunInfo {
  return { task: req.task, tier, model: modelFor(tier), companyId: req.companyId, timeoutMs: req.timeoutMs ?? timeoutMs };
}

function textOf(message: Message): string {
  // Read by type: responses start with thinking blocks.
  return message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}

// ---------------------------------------------------------------- public calls

async function complete<R>(
  req: LlmRequest,
  deps: LlmDeps,
  schema: JsonSchema | undefined,
  finish: (text: string) => R,
): Promise<R & LlmMeta> {
  const tier = req.tier ?? 'writer';
  const info = runInfo(req, tier, 120_000);
  return await withRun(info, deps, async (run) => {
    const message = await run.send(
      buildRequest({
        ...req,
        model: info.model,
        effort: req.effort ?? TIERS[tier].effort,
        maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        schema,
      }),
      req.onText,
    );
    const text = textOf(message);
    if (!text.trim()) throw new LlmInvalidOutputError(`Claude returned no text (stop_reason ${message.stop_reason})`);
    return finish(text);
  });
}

/** Free text. */
export function generateText(req: LlmRequest, deps: LlmDeps = {}): Promise<{ text: string } & LlmMeta> {
  return complete(req, deps, undefined, (text) => ({ text }));
}

/**
 * JSON matching `schema`, through structured outputs. The API guarantees the
 * shape; the check here only catches a response that is not the schema's top
 * level type or is missing a required key.
 */
export async function generate<T>(
  req: LlmRequest & { schema: JsonSchema },
  deps: LlmDeps = {},
): Promise<{ data: T } & LlmMeta> {
  assertStrictSchema(req.schema);
  return await complete(req, deps, req.schema, (text) => ({ data: parseOutput<T>(text, req.schema) }));
}

function parseOutput<T>(text: string, schema: JsonSchema): T {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new LlmInvalidOutputError(`Claude returned text that is not JSON: ${text.slice(0, 200)}`, { cause });
  }
  const isObject = typeof data === 'object' && data !== null && !Array.isArray(data);
  if (schema.type === 'object') {
    const required = (schema.required as string[] | undefined) ?? [];
    const missing = isObject ? required.filter((k) => !(k in (data as object))) : required;
    if (!isObject || missing.length) {
      throw new LlmInvalidOutputError(`Claude output does not match the schema, missing ${missing.join(', ') || 'an object'}`);
    }
  } else if (schema.type === 'array' && !Array.isArray(data)) {
    throw new LlmInvalidOutputError('Claude output does not match the schema, expected an array');
  }
  return data as T;
}

export type ResearchSource = {
  url: string;
  title: string;
  /** True when the answer text cites this page; false for a page that was only returned by a search. */
  cited: boolean;
};

export type ResearchRequest = Pick<LlmRequest, 'task' | 'system' | 'input' | 'effort' | 'maxTokens' | 'companyId' | 'timeoutMs'> & {
  /** Cap on searches for the whole call. Default 10. */
  maxSearches?: number;
};

const MAX_RESUMES = 5;

/**
 * One research answer using Anthropic's server side web search. The search
 * loop runs on Anthropic's side; a pause_turn is resumed by sending the
 * assistant turn back unchanged. Returns the text and every source: pages
 * the answer cites and pages the searches returned.
 */
export async function researchWithWebSearch(
  req: ResearchRequest,
  deps: LlmDeps = {},
): Promise<{ text: string; sources: ResearchSource[] } & LlmMeta> {
  const info = runInfo(req, 'research', 300_000);
  return await withRun(info, deps, async (run) => {
    const today = new Date().toISOString().slice(0, 10);
    const messages: StreamParams['messages'] = [
      // The date goes in the user turn so the system prompt stays cacheable.
      { role: 'user', content: `${req.input}\n\nThe current date is ${today}.` },
    ];
    const sources = new Map<string, ResearchSource>();
    const note = (url: string, title: string | null, cited: boolean) => {
      const seen = sources.get(url);
      sources.set(url, { url, title: seen?.title || title || url, cited: cited || (seen?.cited ?? false) });
    };
    let text = '';
    for (let turn = 0; turn <= MAX_RESUMES; turn++) {
      const message = await run.send({
        model: info.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: { effort: req.effort ?? TIERS.research.effort },
        system: systemBlocks(req.system),
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: req.maxSearches ?? 10 }],
        messages,
        ...fallbackParams(info.model),
      });
      for (const block of message.content) {
        if (block.type === 'web_search_tool_result') {
          // A list on success, a single error object on failure (HTTP 200 either way).
          if (Array.isArray(block.content)) for (const r of block.content) note(r.url, r.title, false);
          else console.warn(`llm: web search failed in ${req.task}: ${block.content.error_code}`);
        } else if (block.type === 'text') {
          text += block.text;
          for (const c of block.citations ?? []) {
            if (c.type === 'web_search_result_location') note(c.url, c.title, true);
          }
        }
      }
      if (message.stop_reason !== 'pause_turn') {
        if (!text.trim()) throw new LlmInvalidOutputError(`Research returned no text (stop_reason ${message.stop_reason})`);
        return { text, sources: [...sources.values()] };
      }
      messages.push({ role: 'assistant', content: message.content });
    }
    throw new LlmError(`Research still paused after ${MAX_RESUMES} resumes`, { retryable: true });
  });
}
