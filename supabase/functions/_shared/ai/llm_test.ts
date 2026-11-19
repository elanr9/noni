// Runs under Deno with no network (see the commands below). Named _test.ts, like
// autoEdit_test.ts, so vitest does not pick it up: vitest cannot load npm: or jsr: imports.
//   cd supabase/functions && DENO_NO_PACKAGE_JSON=1 deno test --allow-env _shared/ai/
import { assert, assertEquals, assertInstanceOf, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import {
  assertStrictSchema,
  buildRequest,
  estimateCostUsd,
  generate,
  generateText,
  type LlmClient,
  type LlmDeps,
  LlmInvalidOutputError,
  LlmRateLimitError,
  LlmRefusalError,
  LlmRequestError,
  LlmSchemaError,
  LlmTruncatedError,
  researchWithWebSearch,
} from './llm.ts';

type Body = Parameters<LlmClient['beta']['messages']['stream']>[0];
type Message = Anthropic.Beta.BetaMessage;

const schema = {
  type: 'object',
  properties: { title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
  required: ['title', 'tags'],
  additionalProperties: false,
};

function message(over: Record<string, unknown> = {}): Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '{"title":"Hi","tags":["a"]}', citations: null },
    ],
    stop_reason: 'end_turn',
    stop_details: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 },
    ...over,
  } as unknown as Message;
}

/** A client that answers from a queue (a message, or an error to throw) and records what it was sent. */
function fake(...replies: Array<Message | Error>) {
  const bodies: Body[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const client: LlmClient = {
    beta: {
      messages: {
        stream(body) {
          // Copied: the research loop appends to the same messages array between requests.
          bodies.push(structuredClone(body));
          const reply = replies.shift() ?? message();
          return {
            request_id: 'req_test',
            finalMessage: () => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)),
          };
        },
      },
    },
  };
  const supabase = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        rows.push({ table, ...row });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as NonNullable<LlmDeps['supabase']>;
  return { deps: { client, supabase }, bodies, rows };
}

/** ai_runs rows are written without being awaited. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const req = { task: 'test.task', system: 'You write briefs.', input: 'Write one.', companyId: null };

Deno.test('assertStrictSchema accepts a strict schema', () => {
  assertStrictSchema(schema);
});

Deno.test('assertStrictSchema rejects an object without additionalProperties: false', () => {
  const bad = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] };
  assertThrows(() => assertStrictSchema(bad), LlmSchemaError, '$: object must set additionalProperties: false');
});

Deno.test('assertStrictSchema rejects a property left out of required, with its path', () => {
  const bad = {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['a'], properties: { a: {}, b: {} } },
      },
    },
  };
  assertThrows(() => assertStrictSchema(bad), LlmSchemaError, '$.items.items: required must list every property, missing b');
});

Deno.test('assertStrictSchema walks anyOf and $defs', () => {
  const loose = { type: 'object', properties: {} };
  assertThrows(() => assertStrictSchema({ anyOf: [{ type: 'string' }, loose] }), LlmSchemaError, '$.anyOf[1]');
  assertThrows(() => assertStrictSchema({ $defs: { thing: loose } }), LlmSchemaError, '$.$defs.thing');
});

Deno.test('generate rejects a loose schema before any request', async () => {
  const { deps, bodies } = fake();
  await assertRejects(() => generate({ ...req, schema: { type: 'object', properties: {} } }, deps), LlmSchemaError);
  assertEquals(bodies.length, 0);
});

const base = { model: 'claude-opus-5-5', effort: 'medium' as const, maxTokens: 16000, system: 'S', input: 'IN' };
const breakpoints = (body: Body) => {
  const blocks = [...(body.system as unknown[]), ...(body.messages[0].content as unknown[])];
  return blocks.filter((b) => (b as { cache_control?: unknown }).cache_control).length;
};

Deno.test('cache layout: system and each of up to three context blocks end in a breakpoint, input does not', () => {
  const body = buildRequest({ ...base, context: ['playbook', '  ', 'brain', 'reference'], images: [{ url: 'https://x/y.png' }] });
  assertEquals(body.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
  assertEquals(body.messages[0].content, [
    { type: 'text', text: 'playbook', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'brain', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'reference', cache_control: { type: 'ephemeral' } },
    { type: 'image', source: { type: 'url', url: 'https://x/y.png' } },
    { type: 'text', text: 'IN' },
  ]);
  assertEquals(breakpoints(body), 4);
});

Deno.test('cache layout: more than three context blocks still use four breakpoints', () => {
  const body = buildRequest({ ...base, context: ['a', 'b', 'c', 'd', 'e'] });
  const content = body.messages[0].content as Array<{ text: string; cache_control?: unknown }>;
  assertEquals(content.filter((b) => b.cache_control).map((b) => b.text), ['a', 'b', 'e']);
  assertEquals(breakpoints(body), 4);
});

Deno.test('request shape: adaptive thinking, effort, structured output, nothing these models reject', () => {
  const body = buildRequest({ ...base, schema }) as Body & Record<string, unknown>;
  assertEquals(body.thinking, { type: 'adaptive' });
  assertEquals(body.output_config, { effort: 'medium', format: { type: 'json_schema', schema } });
  for (const key of ['temperature', 'top_p', 'top_k', 'tool_choice']) assert(!(key in body), key);
});

Deno.test('server side fallbacks are requested for Opus 5.5 and not for Haiku 5.5', () => {
  const opus = buildRequest(base);
  assertEquals(opus.fallbacks, 'default');
  assertEquals(opus.betas, ['server-side-fallback-2026-07-01']);
  const haiku = buildRequest({ ...base, model: 'claude-haiku-5-5' });
  assert(!('fallbacks' in haiku) && !('betas' in haiku));
});

Deno.test('generate returns parsed data, usage and a logged run', async () => {
  const { deps, bodies, rows } = fake();
  const out = await generate<{ title: string; tags: string[] }>({ ...req, schema, context: ['brain'] }, deps);
  assertEquals(out.data, { title: 'Hi', tags: ['a'] });
  assertEquals(out.model, 'claude-opus-5-5');
  assertEquals(out.usage.cacheReadTokens, 1000);
  assertEquals(bodies[0].model, 'claude-opus-5-5');
  assertEquals(bodies[0].max_tokens, 16000);
  assertEquals(bodies[0].output_config?.effort, 'medium');
  await settle();
  assertEquals(rows.length, 1);
  assertEquals(rows[0], {
    table: 'ai_runs',
    id: out.runId,
    task: 'test.task',
    tier: 'writer',
    model: 'claude-opus-5-5',
    company_id: null,
    input_tokens: 100,
    output_tokens: 50,
    cache_read_tokens: 1000,
    cache_write_tokens: 200,
    cost_usd: out.usage.costUsd,
    latency_ms: rows[0].latency_ms,
    stop_reason: 'end_turn',
    error: null,
    request_id: 'req_test',
  });
});

Deno.test('the fast tier defaults to Haiku 5.5 at low effort', async () => {
  const { deps, bodies } = fake(message({ model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'ok' }] }));
  const out = await generateText({ ...req, tier: 'fast' }, deps);
  assertEquals(out.text, 'ok');
  assertEquals(bodies[0].model, 'claude-haiku-5-5');
  assertEquals(bodies[0].output_config, { effort: 'low' });
});

Deno.test('stop_reason max_tokens is LlmTruncatedError, and the run is still logged', async () => {
  const { deps, rows } = fake(message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"title":"H' }] }));
  const err = await assertRejects(() => generate({ ...req, schema }, deps), LlmTruncatedError);
  assertEquals(err.retryable, false);
  await settle();
  assertEquals(rows[0].stop_reason, 'max_tokens');
  assertEquals(rows[0].output_tokens, 50);
  assert(String(rows[0].error).startsWith('LlmTruncatedError'));
});

Deno.test('stop_reason refusal is LlmRefusalError with the category', async () => {
  const refusal = message({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio', explanation: 'no' }, content: [] });
  const { deps, rows } = fake(refusal);
  const err = await assertRejects(() => generateText(req, deps), LlmRefusalError);
  assertEquals(err.category, 'bio');
  await settle();
  assertEquals(rows[0].stop_reason, 'refusal');
});

Deno.test('output missing a required key is LlmInvalidOutputError', async () => {
  const { deps, rows } = fake(message({ content: [{ type: 'text', text: '{"title":"Hi"}' }] }));
  await assertRejects(() => generate({ ...req, schema }, deps), LlmInvalidOutputError, 'missing tags');
  await settle();
  assertEquals(rows.length, 1);
  assert(String(rows[0].error).startsWith('LlmInvalidOutputError'));
});

Deno.test('SDK errors map to typed errors that carry retryable', async () => {
  const headers = new Headers({ 'request-id': 'req_err' });
  const rate = fake(new Anthropic.RateLimitError(429, { type: 'error' }, 'slow down', headers));
  const limited = await assertRejects(() => generateText(req, rate.deps), LlmRateLimitError);
  assertEquals([limited.retryable, limited.status, limited.requestId], [true, 429, 'req_err']);
  assertInstanceOf(limited.cause, Anthropic.RateLimitError);

  const capped = fake(new Anthropic.RateLimitError(429, { type: 'error' }, 'spend cap', new Headers({ 'x-should-retry': 'false' })));
  assertEquals((await assertRejects(() => generateText(req, capped.deps), LlmRateLimitError)).retryable, false);

  const bad = fake(new Anthropic.BadRequestError(400, { type: 'error' }, 'bad', headers));
  assertEquals((await assertRejects(() => generateText(req, bad.deps), LlmRequestError)).retryable, false);
  await settle();
  assertEquals(bad.rows[0].request_id, 'req_err');
  assertEquals(bad.rows[0].stop_reason, null);
});

Deno.test('a failing ai_runs insert never reaches the caller', async () => {
  const { deps } = fake();
  const supabase = { from: () => { throw new Error('db down'); } } as unknown as NonNullable<LlmDeps['supabase']>;
  const out = await generateText(req, { ...deps, supabase });
  assert(out.text.length > 0);
  await settle();
});

Deno.test('cost: Opus 5.5 input, output, cache read and cache write', () => {
  const million = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
  // 4 in + 20 out + 0.20 cache read + 4 * 1.25 cache write
  assertEquals(estimateCostUsd('claude-opus-5-5', million), 29.2);
});

Deno.test('cost: Haiku 5.5, its long prompt rates, and an unknown model', () => {
  const short = { inputTokens: 50_000, outputTokens: 10_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
  assertEquals(estimateCostUsd('claude-haiku-5-5', short), (50_000 * 0.1 + 10_000 * 0.5) / 1e6);
  const long = { inputTokens: 1_000, outputTokens: 10_000, cacheReadTokens: 150_000, cacheWriteTokens: 0 };
  assertEquals(estimateCostUsd('claude-haiku-5-5', long), (1_000 * 0.5 + 150_000 * 0.05 + 10_000 * 2.5) / 1e6);
  assertEquals(estimateCostUsd('some-other-model', short), null);
});

Deno.test('research resumes a paused turn and keeps every source', async () => {
  const paused = message({
    stop_reason: 'pause_turn',
    content: [
      { type: 'server_tool_use', id: 'st_1', name: 'web_search', input: { query: 'q' } },
      {
        type: 'web_search_tool_result',
        tool_use_id: 'st_1',
        content: [
          { type: 'web_search_result', url: 'https://a.com', title: 'A', encrypted_content: 'x', page_age: null },
          { type: 'web_search_result', url: 'https://b.com', title: 'B', encrypted_content: 'x', page_age: null },
        ],
      },
      { type: 'text', text: 'First part. ', citations: null },
    ],
    usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
  });
  const done = message({
    content: [
      {
        type: 'text',
        text: 'Second part.',
        citations: [
          { type: 'web_search_result_location', url: 'https://a.com', title: 'A', cited_text: 't', encrypted_index: 'i' },
          { type: 'web_search_result_location', url: 'https://c.com', title: null, cited_text: 't', encrypted_index: 'i' },
        ],
      },
    ],
    usage: { input_tokens: 20, output_tokens: 7 },
  });
  const { deps, bodies, rows } = fake(paused, done);
  const out = await researchWithWebSearch({ task: 'research.company', system: 'S', input: 'Find out.', maxSearches: 3 }, deps);

  assertEquals(out.text, 'First part. Second part.');
  assertEquals(out.sources, [
    { url: 'https://a.com', title: 'A', cited: true },
    { url: 'https://b.com', title: 'B', cited: false },
    { url: 'https://c.com', title: 'https://c.com', cited: true },
  ]);
  assertEquals(bodies[0].tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }]);
  assertEquals(bodies[0].messages.length, 1);
  // The resume sends the paused assistant turn back unchanged.
  assertEquals(bodies[1].messages.length, 2);
  assertEquals(bodies[1].messages[1], { role: 'assistant', content: paused.content } as Body['messages'][number]);
  assertEquals([out.usage.inputTokens, out.usage.outputTokens, out.usage.webSearches], [30, 12, 1]);
  await settle();
  assertEquals(rows.length, 1);
  assertEquals([rows[0].tier, rows[0].input_tokens, rows[0].stop_reason], ['research', 30, 'end_turn']);
});
