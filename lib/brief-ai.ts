/**
 * "Fill in with AI" for the Briefs forms. Every fill is written by the
 * brief-fill edge function from the active company's brand context (product,
 * audience, voice, features, approved claims). Nothing here is canned copy:
 * when the call fails the caller shows an error and the form stays as typed.
 */
import { newClip, stText, type BriefAi, type BriefClip, type BriefHook, type BriefType, type GuidedState } from './brief-library';
import { supabase } from './supabase';

/** A fill the writer declined: the reason, and what it would need to know. */
export type Declined = { reason: string; questions: string[]; referenceNote: string | null };

export type GuidedPlan = {
  title: string;
  phrase: string;
  clips: BriefClip[];
  caption: string;
  tags: string[];
  angle: string;
  ai: BriefAi;
  declined: Declined | null;
};

type FillClip = { say: string; onScreen: string; cta: boolean; shot?: string };
export type FillResponse = {
  title?: string;
  phrase?: string;
  clips?: FillClip[];
  caption?: string;
  tags?: string[];
  notes?: string;
  titles?: string[];
  angle?: string;
  hooks?: Partial<BriefHook>[];
  kill_reason?: string | null;
  questions?: string[];
  reference_note?: string | null;
  warnings?: string[];
  error?: string;
};

/**
 * The writer plans and writes in one call and revises once when a check
 * fails, after reading the company and the reference; the edge runtime ends
 * a request at 150 seconds. Title ideas and questions are one short call.
 */
export const FILL_TIMEOUT_MS = 150_000;
const TITLES_TIMEOUT_MS = 25_000;

async function errorMessage(error: { message: string }): Promise<string> {
  // FunctionsHttpError carries the response; surface the server's message when there is one.
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const j = (await ctx.json()) as { error?: string };
      if (j?.error) return j.error;
    }
  } catch {
    // keep the transport message
  }
  return error.message;
}

/** Calls an AI edge function that answers with a JSON body, throwing its `error` or a timeout. */
export async function callAi<T extends { error?: string }>(fn: string, body: Record<string, unknown>, timeoutMs = FILL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The timeout option aborts the request; the race covers a fetch that does not honour the abort.
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The writer took too long')), timeoutMs + 2000);
  });
  try {
    const { data, error } = await Promise.race([supabase.functions.invoke<T>(fn, { body, timeout: timeoutMs }), late]);
    if (error) throw new Error(await errorMessage(error));
    if (!data || data.error) throw new Error(data?.error ?? 'No answer from the writer');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function callFill(body: Record<string, unknown>, timeoutMs = FILL_TIMEOUT_MS): Promise<FillResponse> {
  return callAi<FillResponse>('brief-fill', body, timeoutMs);
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /\S/.test(x)) : []);

function hooksOf(res: FillResponse): BriefHook[] {
  return (Array.isArray(res.hooks) ? res.hooks : [])
    .map((h) => ({ say: (h?.say ?? '').trim(), onScreen: (h?.onScreen ?? '').trim(), visual: (h?.visual ?? '').trim(), archetype: (h?.archetype ?? '').trim() }))
    .filter((h) => h.say || h.onScreen)
    .slice(0, 3);
}

function declinedOf(res: FillResponse): Declined | null {
  const reason = (res.kill_reason ?? '').trim();
  return reason ? { reason, questions: strings(res.questions), referenceNote: res.reference_note?.trim() || null } : null;
}

function aiOf(res: FillResponse): BriefAi {
  const raw = res.clips ?? [];
  return {
    hooks: hooksOf(res),
    warnings: strings(res.warnings),
    referenceNote: res.reference_note?.trim() || null,
    questions: strings(res.questions),
    draft: raw.length
      ? {
          title: (res.title ?? '').trim(),
          clips: raw.map((c) => ({ say: c.say ?? '', onScreen: c.onScreen ?? '', cta: !!c.cta })),
          caption: (res.caption ?? '').trim(),
          tags: res.tags ?? [],
        }
      : null,
  };
}

/** Green screen, per clip mode: hook and CTA face to camera, the points get the creator's own background. */
function greenify(clips: BriefClip[], g: GuidedState, type: BriefType): BriefClip[] {
  if (type !== 'Greenscreen' || g.fullGreen) return clips;
  return clips.map((c, i) => ({ ...c, green: i > 0 && !c.cta, gs: null }));
}

/** A guided plan (title, search phrase, clips, caption, tags) for this company, or why the writer declined. Throws on failure. */
export async function planGuided(g: GuidedState, type: BriefType, answers: AskAnswer[] = []): Promise<GuidedPlan> {
  const res = await callFill({ mode: 'guided', type, title: g.title, link: g.link, linkNotes: g.linkNotes, notes: g.notes, answers });
  return guidedPlanOf(res, g, type);
}

/** The app's plan from a guided answer of brief-fill or brief-import. */
export function guidedPlanOf(res: FillResponse, g: GuidedState, type: BriefType): GuidedPlan {
  const raw = res.clips ?? [];
  const clips = raw.map((c) => {
    const shot = (c.shot ?? '').trim();
    const extra = shot ? { shot } : {};
    return type === 'Slideshow' && c.cta
      ? newClip('', { onScreen: c.onScreen, cta: true, doc: { texts: [stText(c.onScreen, { y: 22, size: 20 })], overlays: [] }, ...extra })
      : newClip(type === 'Slideshow' || type === 'Long Text' ? '' : c.say, { onScreen: c.onScreen, cta: c.cta, ...extra });
  });
  return {
    title: (res.title || g.title || '').trim(),
    phrase: (res.phrase || '').trim(),
    clips: greenify(clips, g, type),
    caption: (res.caption || '').trim(),
    tags: res.tags ?? [],
    angle: (res.angle || '').trim(),
    ai: aiOf(res),
    declined: declinedOf(res),
  };
}

export type OutlinePlan = { title: string; notes: string; declined: Declined | null; referenceNote: string | null };

/** Outline fill: a title (kept when the manager typed one) and notes, from a link or a title. */
export async function planOutline(input: { title: string; link: string; notes?: string }): Promise<OutlinePlan> {
  // With a link, the notes field holds what changes from the reference.
  const res = await callFill({ mode: 'outline', title: input.title, link: input.link, ...(input.link ? { linkNotes: input.notes } : { notes: input.notes }) });
  return { title: (res.title || '').trim(), notes: (res.notes || '').trim(), declined: declinedOf(res), referenceNote: res.reference_note?.trim() || null };
}

/** A question the writer puts to the manager before it writes, answered with a tap. */
export type AskQuestion = { id: string; question: string; options: string[]; many: boolean };
/** What the manager tapped or typed for one question. */
export type AskAnswer = { question: string; answers: string[] };

const ASK_TIMEOUT_MS = 14_000;
const askCache = new Map<string, Promise<AskQuestion[]>>();

/**
 * The few questions to ask before writing this idea. Asked once per idea and
 * kept, so it can start while the manager is still on the title and be ready
 * when they tap Fill in with AI. Any failure is no questions: the writer
 * then writes straight away.
 */
export function askGuided(title: string, type: BriefType, notes = ''): Promise<AskQuestion[]> {
  const idea = title.trim();
  if (idea.length < 4) return Promise.resolve([]);
  const key = `${type}|${idea.toLowerCase()}`;
  const hit = askCache.get(key);
  if (hit) return hit;
  const run = callAi<{ questions?: AskQuestion[]; error?: string }>('brief-fill', { mode: 'questions', type, title: idea, notes }, ASK_TIMEOUT_MS)
    .then((res) =>
      (Array.isArray(res.questions) ? res.questions : [])
        .filter((q) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2)
        .slice(0, 3)
        .map((q, i) => ({ id: q.id || `q${i + 1}`, question: q.question, options: q.options.filter((o) => typeof o === 'string' && /\S/.test(o)).slice(0, 4), many: q.many === true })),
    )
    .catch(() => {
      askCache.delete(key);
      return [] as AskQuestion[];
    });
  askCache.set(key, run);
  return run;
}

export type LongTextPlan = { onScreen: string; ai: BriefAi; declined: Declined | null };

/** The on-screen story for a Long Text post. */
export async function longTextPlan(title: string): Promise<LongTextPlan> {
  const res = await callFill({ mode: 'long_text', type: 'Long Text', title });
  return { onScreen: (res.clips?.[0]?.onScreen || '').trim(), ai: aiOf(res), declined: declinedOf(res) };
}

export const LONG_TEXT_NOTES = 'One take, eyes on the lens, natural light. Hold the frame for the full 7 seconds.';

/** Title ideas for what is typed so far, written for this company. */
export async function fetchTitleIdeas(typed: string, type: BriefType | null): Promise<string[]> {
  const res = await callFill({ mode: 'titles', type: type ?? 'Talking Head', typed }, TITLES_TIMEOUT_MS);
  return (res.titles ?? []).filter(Boolean);
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A creator's copy of a stored long text: `{a|b}` spins resolve again so no two accounts post the same string. */
export function varyLongText(src: string): string {
  if (!src.includes('{')) return src;
  const spin = (s: string) =>
    s
      .replace(/\{([^{}]+)\}/g, (_, g: string) => pick(g.split('|')))
      .replace(/\s+([.,!?])/g, '$1')
      .replace(/ {2,}/g, ' ')
      .trim();
  return src
    .split('\n\n')
    .map((p) => cap(spin(p)))
    .join('\n\n');
}

/** Words of `t` that start with a typed word, for bolding in the suggestion list. */
export function matchedWords(t: string, typed: string): { text: string; hit: boolean }[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  return t.split(/(\s+)/).map((w) => ({ text: w, hit: !!w.trim() && words.some((q) => w.toLowerCase().startsWith(q)) }));
}

/** The first http(s) or bare tiktok/instagram/youtube link in pasted text, or null. */
export function linkFrom(text: string): string | null {
  const m = text.match(/https?:\/\/\S+|(?:www\.)?(?:tiktok\.com|instagram\.com|youtube\.com|youtu\.be)\/\S+/i);
  return m ? m[0].replace(/[),.]+$/, '') : null;
}

// ---- Reference links ----

export type ReferenceState = { status: 'idle' | 'pending' | 'done' | 'failed'; reason?: string };

/** The reference reader takes TikTok and Instagram posts. */
export function isSocialLink(link: string): boolean {
  try {
    const host = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`).hostname;
    return /(^|\.)(tiktok|instagram)\.com$/i.test(host);
  } catch {
    return false;
  }
}

const REFERENCE_POLL_MS = 4000;
/** Reading a post (scrape, transcript, frames, analysis) takes one to three minutes. */
const REFERENCE_MAX_MS = 4 * 60_000;
const referenceRuns = new Map<string, Promise<ReferenceState>>();

async function runReference(link: string): Promise<ReferenceState> {
  const until = Date.now() + REFERENCE_MAX_MS;
  let misses = 0;
  while (Date.now() < until) {
    const { data, error } = await supabase.functions.invoke<{ status?: string; reason?: string; error?: string }>('reference-analyze', { body: { url: link }, timeout: 30_000 });
    if (error || !data?.status) {
      // The fill reads the post itself when this never got going.
      misses += 1;
      if (misses >= 3) return { status: 'idle' };
    } else if (data.status === 'done') return { status: 'done' };
    else if (data.status === 'failed') return { status: 'failed', reason: data.reason };
    await new Promise((r) => setTimeout(r, REFERENCE_POLL_MS));
  }
  return { status: 'idle' };
}

/**
 * Starts reading a reference post as soon as its link is on the brief, once
 * per link, and resolves when the reading ends. Fill in with AI then finds
 * the analysis stored. Never throws.
 */
export function warmReference(link: string): Promise<ReferenceState> {
  const key = link.trim();
  if (!isSocialLink(key)) return Promise.resolve({ status: 'idle' });
  let run = referenceRuns.get(key);
  if (!run) {
    run = runReference(key).catch((): ReferenceState => ({ status: 'idle' }));
    referenceRuns.set(key, run);
    // A reading that did not finish may be tried again; a finished or failed one is the answer.
    void run.then((r) => {
      if (r.status === 'idle') referenceRuns.delete(key);
    });
  }
  return run;
}

/** `warmReference`, but no longer than `ms`: the fill goes ahead and the writer waits on the rest itself. */
export function referenceWithin(link: string, ms: number): Promise<ReferenceState> {
  return Promise.race([warmReference(link), new Promise<ReferenceState>((r) => setTimeout(() => r({ status: 'pending' }), ms))]);
}

// ---- Learning signals ----

/** What a saved brief keeps of the fill, to compare with the engine's draft. */
export type SavedForSignal = { title: string; clips: { say: string; onScreen: string; cta: boolean }[]; caption: string; tags: string[] };

/**
 * Tells the brain what the manager kept and changed of an AI-filled brief
 * (brain-signal stores it as a raw learning signal). Fire and forget: it
 * never blocks or breaks a save.
 */
export function logBriefEdit(input: { libraryBriefId: string; type: BriefType; ai: BriefAi | null | undefined; angle?: string; saved: SavedForSignal }): void {
  const draft = input.ai?.draft;
  if (!draft || !draft.clips.length) return;
  void supabase.functions
    .invoke('brain-signal', {
      body: {
        signal: 'brief_edit',
        library_brief_id: input.libraryBriefId,
        brief_type: input.type,
        draft: { ...draft, hooks: input.ai?.hooks ?? [], angle: input.angle ?? '' },
        saved: input.saved,
      },
      timeout: 20_000,
    })
    .then(({ error }) => {
      if (error) console.warn('brief edit signal not saved', error.message);
    })
    .catch(() => undefined);
}

