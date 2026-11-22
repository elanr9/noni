// The onboarding conversation on the web (/onboarding).
//
// A new company admin talks to Noni the way they would talk to a UGC agency
// on a first call. The agenda is fixed and lives here (AGENDA): this code
// decides which question comes next from what is already saved, and saves
// every answer to the same places the old form did. The model only writes
// the words: it reacts to the last answer, uses what the site scan found,
// and may ask one follow-up when a written answer is too thin to brief a
// creator from. The reply streams as server-sent events.
//
// POST { action: 'state' }
//   200 { messages: [{ role, text, slot }], pending: SlotSpec | null,
//         first_name, company_name }
// POST { action: 'turn', answer?: { slot, value: string | string[], text } }
//   200 text/event-stream, one JSON object per `data:` line:
//     { type: 'delta', text }          words as they are written
//     { type: 'done', pending }        the input to show next (null at the end)
//     { type: 'error', message }
//   With no answer and an empty conversation it opens with a greeting.
//
// Company admins of the active company only (and the platform admin).

import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { addManualFact, loadLiveFacts, type CompanySnapshot } from '../_shared/ai/brain.ts';
import { renderRetrieved } from '../_shared/ai/brainCore.ts';
import { generate } from '../_shared/ai/llm.ts';
import { adminClient, authenticate, corsHeaders, handleCors, jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MODEL = Deno.env.get('NONI_ONBOARDING_CHAT_MODEL') ?? 'claude-haiku-5-5';

// ---------------------------------------------------------------- agenda

type Option = { value: string; label: string };
type SlotKind = 'choice' | 'multi' | 'text' | 'summary' | 'done';

type Slot = {
  key: string;
  kind: SlotKind;
  /** What the message has to get across or ask, for the model. */
  ask: string;
  options?: Option[];
  placeholder?: string;
  /** Written answers only: the model may ask one follow-up. */
  followUp?: boolean;
  /** Skip the slot when this says so. */
  when?: (s: State) => boolean;
  /** Choices written from the site scan (companies.onboarding_options). */
  dynamic?: CompanyKey;
  /** Fixed choices added after the written ones. */
  extra?: Option[];
};

type CompanyKey = 'sells' | 'audience' | 'price' | 'cta' | 'never_say';
const COMPANY_KEYS: CompanyKey[] = ['sells', 'audience', 'price', 'cta', 'never_say'];

/** The input the web shows under the newest message. */
export type SlotSpec = {
  key: string;
  kind: SlotKind;
  options?: Option[];
  placeholder?: string;
  /** A draft answer taken from the site, offered as "That's right". */
  draft?: string;
};

/** They (or their team) run the campaigns; false once they hand it to Noni. */
const selfRun = (s: State): boolean => s.runBy !== 'noni';

const AGENDA: Slot[] = [
  {
    key: 'website',
    kind: 'text',
    ask: "This is the first message. Say hi with their first name, say you are Noni, and say you have a few quick questions before you get started (use those words). Then ask for their website so you can read it while you talk (if one is on file, ask them to confirm it). Under 30 words.",
    placeholder: 'yourcompany.com',
  },
  // Asked second: everything after branches on it. When Noni runs it, the
  // company is hands off, so only the few questions Noni cannot answer itself
  // are asked; when they run it, they answer every question themselves.
  {
    key: 'runs_campaigns',
    kind: 'choice',
    ask: 'Say you are reading their site now in the background. Ask if they want Noni to run everything for them, fully hands off, or if they or someone on their team will run it day to day (approving videos, keeping creators on pace).',
    options: [
      { value: 'noni', label: 'Noni runs it for us' },
      { value: 'me', label: 'Me' },
      { value: 'team', label: 'Someone on my team' },
    ],
  },
  {
    key: 'goal',
    kind: 'choice',
    ask: 'Ask what the videos should do first for them.',
    options: [
      { value: 'signups', label: 'Downloads and sign ups' },
      { value: 'audience', label: 'A bigger audience' },
      { value: 'trust', label: 'Trust in the brand' },
    ],
  },
  {
    key: 'platforms',
    when: selfRun,
    kind: 'multi',
    ask: 'Ask where the videos should go. They can pick more than one.',
    options: [
      { value: 'tiktok', label: 'TikTok' },
      { value: 'instagram', label: 'Instagram Reels' },
      { value: 'youtube', label: 'YouTube Shorts' },
    ],
  },
  {
    key: 'creators_wanted',
    when: selfRun,
    kind: 'choice',
    ask: 'Ask how many creators they want posting. Mention Noni finds and manages them.',
    options: [
      { value: '1-5', label: '1 to 5' },
      { value: '5-10', label: '5 to 10' },
      { value: '10-25', label: '10 to 25' },
      { value: '25+', label: '25 or more' },
    ],
  },
  {
    key: 'launch',
    kind: 'choice',
    ask: 'Ask when they want the first videos live.',
    options: [
      { value: 'this_week', label: 'This week' },
      { value: 'this_month', label: 'Within a month' },
      { value: 'exploring', label: 'Just exploring' },
    ],
  },
  // The company, as one-tap choices written from what the site scan found.
  {
    key: 'sells',
    when: selfRun,
    kind: 'choice',
    dynamic: 'sells',
    ask: 'Say you have read their site. Ask them to pick the line that best says what the company does. The choices are shown as buttons, do not list them.',
  },
  {
    key: 'audience',
    when: selfRun,
    kind: 'multi',
    dynamic: 'audience',
    ask: 'Ask who they are selling to. They can pick more than one.',
  },
  {
    key: 'price',
    when: selfRun,
    kind: 'choice',
    dynamic: 'price',
    ask: 'Ask what it costs.',
  },
  {
    key: 'cta',
    when: selfRun,
    kind: 'choice',
    dynamic: 'cta',
    ask: 'Ask what a viewer should do right after watching.',
  },
  {
    key: 'never_say',
    when: selfRun,
    kind: 'multi',
    dynamic: 'never_say',
    extra: [{ value: 'none', label: 'Nothing specific' }],
    ask: 'Ask if there is anything creators must never say or show. They can pick any, or nothing specific.',
  },
  // They run it, so the detail creators are briefed from comes from them.
  {
    key: 'voice',
    when: selfRun,
    kind: 'choice',
    ask: 'Ask how creators should sound on camera.',
    options: [
      { value: 'casual', label: 'Casual and funny' },
      { value: 'direct', label: 'Straight to the point' },
      { value: 'personal', label: 'Real and personal' },
      { value: 'hype', label: 'High energy' },
    ],
  },
  {
    key: 'must_show',
    when: selfRun,
    kind: 'text',
    ask: 'Ask what every video has to show or say, in one line.',
    placeholder: 'The home screen and the free trial',
  },
  {
    key: 'competitors',
    when: selfRun,
    kind: 'text',
    ask: 'Last one. Ask who they compete with, so creators never mention them by name.',
    placeholder: 'Names, or none',
  },
  {
    key: 'done',
    when: selfRun,
    kind: 'done',
    ask: 'Close in one or two short sentences: they are set, Noni is writing their first briefs now.',
  },
  {
    key: 'done',
    when: (s) => !selfRun(s),
    kind: 'done',
    ask: 'Close in one or two short sentences: that is all Noni needs, the Noni team takes it from here and will reach out to set up a quick call.',
  },
];

// ---------------------------------------------------------------- state

type ChatMessage = { role: 'assistant' | 'user'; text: string; slot: string };
type ChatState = { messages: ChatMessage[]; answered: string[]; followups: Record<string, number> };

type State = {
  companyId: string;
  userId: string;
  firstName: string;
  companyName: string;
  website: string;
  chat: ChatState;
  suggestions: Record<string, { text: string }>;
  snapshot: CompanySnapshot | null;
  answers: Record<string, { answer: string }>;
  options: CompanyOptions;
  /** companies.intake.campaigns_run_by: 'noni' | 'me' | 'team'. */
  runBy: string;
};

type CompanyOptions = Partial<Record<CompanyKey, string[]>> & { status?: 'generating' | 'ready'; at?: string };

async function loadState(admin: SupabaseClient, companyId: string, userId: string): Promise<State> {
  const [{ data: company }, { data: profile }, { data: survey }] = await Promise.all([
    admin.from('companies').select('name, website, onboarding_chat, onboarding_options, intake').eq('id', companyId).maybeSingle(),
    admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    admin.from('brain_survey').select('suggestions, snapshot, answers').eq('company_id', companyId).maybeSingle(),
  ]);
  const raw = (company?.onboarding_chat ?? {}) as Partial<ChatState>;
  return {
    companyId,
    userId,
    firstName: String(profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '',
    companyName: String(company?.name ?? 'your company'),
    website: String(company?.website ?? ''),
    chat: { messages: raw.messages ?? [], answered: raw.answered ?? [], followups: raw.followups ?? {} },
    suggestions: (survey?.suggestions ?? {}) as Record<string, { text: string }>,
    snapshot: (survey?.snapshot ?? null) as CompanySnapshot | null,
    answers: (survey?.answers ?? {}) as Record<string, { answer: string }>,
    options: (company?.onboarding_options ?? {}) as CompanyOptions,
    runBy: String((company?.intake as { campaigns_run_by?: unknown } | null)?.campaigns_run_by ?? ''),
  };
}

function nextSlot(s: State): Slot | null {
  return AGENDA.find((slot) => !s.chat.answered.includes(slot.key) && (slot.when ? slot.when(s) : true)) ?? null;
}

/** A site as people say it: www.inkbound.ai. */
function wwwHost(url: string): string {
  const host = url.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (!host) return '';
  return host.startsWith('www.') ? host : `www.${host}`;
}

/** How far along they are: answered questions out of all of them. */
function progressOf(s: State): { at: number; total: number } {
  const asked = AGENDA.filter((x) => x.kind !== 'done' && (x.when ? x.when(s) : true));
  return { at: asked.filter((x) => s.chat.answered.includes(x.key)).length, total: asked.length };
}

function specFor(slot: Slot | null, s: State): SlotSpec | null {
  if (!slot) return null;
  const draft = slot.kind === 'text' ? s.suggestions[slot.key]?.text : undefined;
  const written = slot.dynamic ? (s.options[slot.dynamic] ?? []).map((l) => ({ value: l, label: l })) : [];
  const options = slot.dynamic ? [...written, ...(slot.extra ?? [])] : slot.options;
  return {
    key: slot.key,
    // With nothing written for it, a company question is answered in words.
    kind: slot.dynamic && !written.length ? 'text' : slot.kind,
    ...(options && options.length ? { options } : {}),
    ...(slot.key === 'website' && s.website ? { draft: wwwHost(s.website) } : draft ? { draft } : {}),
    ...(slot.placeholder ? { placeholder: slot.placeholder } : {}),
  };
}

// ---------------------------------------------------------------- saving answers

async function saveAnswer(
  admin: SupabaseClient,
  s: State,
  slot: Slot,
  value: string | string[],
  text: string,
): Promise<void> {
  const one = Array.isArray(value) ? value[0] ?? '' : value;
  const mergeIntake = async (patch: Record<string, unknown>) => {
    const { data } = await admin.from('companies').select('intake').eq('id', s.companyId).maybeSingle();
    await admin
      .from('companies')
      .update({ intake: { ...((data?.intake as Record<string, unknown>) ?? {}), ...patch } })
      .eq('id', s.companyId);
  };
  switch (slot.key) {
    case 'role':
      await admin.from('companies').update({ admin_role: one }).eq('id', s.companyId);
      return;
    case 'website': {
      const site = text.trim();
      if (site) await admin.from('companies').update({ website: site }).eq('id', s.companyId);
      return;
    }
    case 'goal':
    case 'creators_wanted':
    case 'monthly_budget':
    case 'launch':
    case 'voice':
    case 'must_show':
    case 'competitors':
      await mergeIntake({ [slot.key]: one });
      return;
    case 'platforms':
      await mergeIntake({ platforms: Array.isArray(value) ? value : [value] });
      return;
    case 'does_ugc':
      await admin.from('companies').update({ does_ugc: one === 'yes' }).eq('id', s.companyId);
      return;
    case 'runs_campaigns':
      // 'noni': Noni's team runs the campaigns, nobody of theirs to invite.
      await admin
        .from('companies')
        .update({ manager_count: one === 'noni' ? 0 : 1, self_is_manager: one === 'me' })
        .eq('id', s.companyId);
      await mergeIntake({ campaigns_run_by: one });
      s.runBy = one;
      return;
    default:
      if (slot.dynamic) {
        const picks = (Array.isArray(value) ? value : [value]).map((v) => String(v).trim()).filter((v) => v && v !== 'none');
        await mergeIntake({ [slot.key]: Array.isArray(value) ? picks : picks[0] ?? '' });
        // What they picked is what the company says: confirmed records the
        // briefs are written from. Made in the background.
        EdgeRuntime.waitUntil(saveCompanyFacts(admin, s, slot.dynamic, picks).catch((e) =>
          console.error('onboarding-chat facts', e instanceof Error ? e.message : e)
        ));
      }
  }
}

async function saveCompanyFacts(admin: SupabaseClient, s: State, key: CompanyKey, picks: string[]): Promise<void> {
  for (const pick of picks) {
    const input =
      key === 'sells'
        ? { entity_type: 'product' as const, title: s.companyName, data: { name: s.companyName, one_liner: pick } }
        : key === 'audience'
          ? { entity_type: 'persona' as const, title: pick.slice(0, 80), data: { label: pick, situation: pick } }
          : key === 'price'
            ? { entity_type: 'offer' as const, title: 'Price', data: { kind: 'pricing', terms: pick } }
            : key === 'cta'
              ? { entity_type: 'offer' as const, title: 'What to do next', data: { kind: 'cta', terms: pick } }
              : { entity_type: 'compliance' as const, title: pick.slice(0, 80), data: { rule: pick } };
    await addManualFact(admin, s.companyId, input, s.userId);
  }
}

const OPTIONS_SYSTEM = `You are setting up a UGC campaign for a company. From what a scan of its website found, write the answer choices a busy founder will tap in a chat. Each choice is a short, plain line (under 12 words), specific to this company, in their own terms. No dashes, no hype, no emoji.

sells: three different ways to say what the company does, each a full line a founder would agree with (for example "Turns a full game into a highlight video").
audience: two to four specific groups it sells to, concrete enough to brief a creator (for example "High school players chasing a college spot", "College players looking to transfer", "Parents of recruits").
price: two or three lines for what it costs, from what the site says (for example "Free to start, $19 a month for Pro"). If the site shows no price, offer common shapes: "Free", "Free trial, then paid", "Paid plans".
cta: two or three things a viewer should do right after watching (for example "Download the app", "Start free on the website", "Use creator code for 20% off").
never_say: three or four things a creator in this category must never claim or show (for example "Guarantee a scholarship", "Show a real player's private data").`;

/** Writes the company question choices once, from whatever the scan has so far. */
async function ensureOptions(admin: SupabaseClient, s: State, wait: boolean): Promise<void> {
  if (s.options.status === 'ready') return;
  const fresh = s.options.status === 'generating' && Date.now() - Date.parse(s.options.at ?? '') < 60_000;
  if (fresh && !wait) return;
  if (fresh && wait) {
    // Another request is writing them; wait for it.
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data } = await admin.from('companies').select('onboarding_options').eq('id', s.companyId).maybeSingle();
      const o = (data?.onboarding_options ?? {}) as CompanyOptions;
      if (o.status === 'ready') {
        s.options = o;
        return;
      }
    }
    return;
  }

  let facts = await loadLiveFacts(admin, s.companyId);
  if (!facts.length) {
    if (!wait) return;
    // The scan is still reading the site; give it a little longer.
    for (let i = 0; i < 20 && !facts.length; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      facts = await loadLiveFacts(admin, s.companyId);
    }
    if (!facts.length) return;
  }
  await admin
    .from('companies')
    .update({ onboarding_options: { status: 'generating', at: new Date().toISOString() } })
    .eq('id', s.companyId);
  try {
    const list = { type: 'array', items: { type: 'string' } };
    const { data } = await generate<Record<CompanyKey, string[]>>({
      task: 'onboarding.options',
      tier: 'fast',
      system: OPTIONS_SYSTEM,
      context: [`Company: ${s.companyName}\n\nRecords from the site\n${renderRetrieved(facts.filter((f) => f.usage !== 'blocked'), new Date())}`],
      input: 'Write the choices.',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: COMPANY_KEYS,
        properties: Object.fromEntries(COMPANY_KEYS.map((k) => [k, list])),
      },
      maxTokens: 1500,
      companyId: s.companyId,
      timeoutMs: 45_000,
    });
    const clean = (xs: string[] | undefined, n: number) =>
      [...new Set((xs ?? []).map((x) => x.replace(/\s*[—–]\s*/g, ', ').trim()).filter(Boolean))].slice(0, n);
    const options: CompanyOptions = {
      status: 'ready',
      at: new Date().toISOString(),
      sells: clean(data.sells, 3),
      audience: clean(data.audience, 4),
      price: clean(data.price, 3),
      cta: clean(data.cta, 3),
      never_say: clean(data.never_say, 4),
    };
    await admin.from('companies').update({ onboarding_options: options }).eq('id', s.companyId);
    s.options = options;
  } catch (e) {
    console.error('onboarding-chat options', e instanceof Error ? e.message : e);
    await admin.from('companies').update({ onboarding_options: {} }).eq('id', s.companyId);
  }
}

async function saveChat(admin: SupabaseClient, s: State): Promise<void> {
  // Keep the stored conversation bounded; the model only ever sees the tail.
  const chat = { ...s.chat, messages: s.chat.messages.slice(-80) };
  await admin.from('companies').update({ onboarding_chat: chat }).eq('id', s.companyId);
}

// ---------------------------------------------------------------- the model

const SYSTEM = `You are Noni, the strategist at a UGC agency, on a first call with a new client in a chat. You are warm, sharp and quick, like the best account lead they have ever worked with. Each turn the app tells you what to ask next; your job is the words.

How you write:
- Short. Under 25 words per message. At most one quick line reacting to what they said, then the question. Most messages should just be the next question with a few words of context.
- The person is busy and deciding whether Noni is worth it. Every message should move fast and feel like momentum, never like a form.
- A reaction must be specific to their business, never generic praise ("Great!", "Love it", "Awesome"). Do not repeat their answer back to them.
- Plain words. No em dashes or en dashes, no emoji, no exclamation marks, no hype words, no filler ("seamless", "empower", "unlock", "game-changer", "dive in", "elevate").
- Never invent facts about their company. Use only what they said and what the site scan found, given below.
- The answer choices are shown to them as buttons under your message. NEVER list, name or paraphrase choices in your message (no "X, Y, or Z?"); just ask the question.
- Address them as "you". Use their first name only in your first message and rarely after that, never in two messages in a row. Refer to the company by name.
- Do not include internal or system XML tags in your response.`;

const FOLLOW_UP_TOOL = {
  name: 'follow_up',
  description:
    'Call this after your message when, instead of moving on, your message asked one follow-up about their last written answer because it was too thin or vague to brief a creator from. Do not call it when you moved on to the next question.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: { reason: { type: 'string', description: 'What was missing, in a few words.' } },
    required: ['reason'],
  },
};

function siteContext(s: State): string {
  const snap = s.snapshot;
  if (!snap) return 'The site scan has not finished yet.';
  const lines = [
    snap.sells ? `Sells: ${snap.sells.text}` : '',
    snap.audience ? `For: ${snap.audience.text}` : '',
    snap.viral ? `Viral feature: ${snap.viral.text}` : '',
    snap.features.length ? `Features: ${snap.features.map((f) => f.title).join(', ')}` : '',
  ].filter(Boolean);
  return lines.length ? `What the site scan found:\n${lines.join('\n')}` : 'The site scan found little.';
}

function turnInstruction(s: State, slot: Slot | null, last: { slot: Slot; text: string; mayFollowUp: boolean } | null): string {
  const parts = [`Company: ${s.companyName}. Person: ${s.firstName || 'unknown name'}.`, siteContext(s)];
  if (s.website) parts.push(`Website on file: ${wwwHost(s.website)} (always write a website with the www. in front, like this)`);
  if (last) {
    parts.push(`They just answered "${last.slot.key}": ${last.text}`);
    if (last.mayFollowUp) {
      parts.push(
        'If that answer is too thin or vague to brief a creator from (a creator could not film or say it), ask ONE short, specific follow-up about it instead of moving on, and call the follow_up tool. Otherwise move on.',
      );
    }
  }
  if (slot) {
    parts.push(`Next: ${slot.ask}`);
    const draft = slot.kind === 'text' ? s.suggestions[slot.key]?.text : undefined;
    if (draft) parts.push(`Draft from their site for this question: ${draft}`);
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------- handler

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (!caller.companyAdmin && !caller.platformAdmin) return jsonResponse({ error: 'Company admins only' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'No active company' }, 400);
  const body = ((await req.json().catch(() => null)) ?? {}) as {
    action?: string;
    answer?: { slot?: string; value?: string | string[]; text?: string };
  };

  const s = await loadState(admin, caller.companyId, caller.userId);

  if (body.action === 'state') {
    return jsonResponse({
      messages: s.chat.messages,
      pending: s.chat.messages.length ? specFor(nextSlot(s), s) : null,
      first_name: s.firstName,
      company_name: s.companyName,
      progress: progressOf(s),
    });
  }
  if (body.action !== 'turn') return jsonResponse({ error: 'Unknown action' }, 400);

  // 1. Save the answer to the slot that was open.
  let last: { slot: Slot; text: string; mayFollowUp: boolean } | null = null;
  const open = nextSlot(s);
  if (body.answer && open && body.answer.slot === open.key) {
    const text = String(body.answer.text ?? '').trim();
    const value = body.answer.value ?? text;
    try {
      await saveAnswer(admin, s, open, value, text);
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : 'Could not save that answer' }, 500);
    }
    s.chat.messages.push({ role: 'user', text: text || (Array.isArray(value) ? value.join(', ') : value), slot: open.key });
    const mayFollowUp = Boolean(open.followUp) && (s.chat.followups[open.key] ?? 0) < 1 && text.length > 0;
    last = { slot: open, text, mayFollowUp };
    s.chat.answered.push(open.key);
  } else if (body.answer && !open) {
    return jsonResponse({ error: 'The conversation is finished' }, 400);
  } else if (s.chat.messages.length && !body.answer) {
    // Nothing new to say: the last message is still waiting for an answer.
    return jsonResponse({ error: 'Answer the question first' }, 400);
  }

  const slot = nextSlot(s);

  // The company questions need their choices. Written ahead in the
  // background once the site is being read, waited for if not ready yet.
  if (slot?.dynamic) await ensureOptions(admin, s, true);
  else if (s.chat.answered.includes('website')) EdgeRuntime.waitUntil(ensureOptions(admin, s, false));

  // 2. Stream the reply.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = '';
      let followedUp = false;
      try {
        const client = new Anthropic();
        const history: Anthropic.MessageParam[] = [];
        for (const m of s.chat.messages.slice(-16)) {
          const role = m.role === 'assistant' ? 'assistant' : 'user';
          if (history.length && history[history.length - 1].role === role) {
            history[history.length - 1] = { role, content: `${history[history.length - 1].content}\n\n${m.text}` };
          } else history.push({ role, content: m.text });
        }
        // The turn's instruction rides on a user turn, after the history.
        const instruction = turnInstruction(s, slot, last);
        if (history.length && history[history.length - 1].role === 'user') {
          history[history.length - 1] = {
            role: 'user',
            content: `${history[history.length - 1].content}\n\n<turn_instructions>\n${instruction}\n</turn_instructions>`,
          };
        } else {
          if (history.length === 0 || history[0].role !== 'user') history.unshift({ role: 'user', content: '(The chat opens.)' });
          history.push({ role: 'user', content: `<turn_instructions>\n${instruction}\n</turn_instructions>` });
        }

        const response = client.messages.stream({
          model: MODEL,
          max_tokens: 600,
          thinking: { type: 'disabled' },
          output_config: { effort: 'low' },
          system: SYSTEM,
          ...(last?.mayFollowUp ? { tools: [FOLLOW_UP_TOOL], tool_choice: { type: 'auto' } } : {}),
          messages: history,
        } as Anthropic.MessageStreamParams);

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            text += event.delta.text;
            controller.enqueue(sse({ type: 'delta', text: event.delta.text }));
          }
        }
        const final = await response.finalMessage();
        if (final.stop_reason === 'refusal') throw new Error('refused');
        followedUp = final.content.some((b) => b.type === 'tool_use' && b.name === 'follow_up');
      } catch (e) {
        console.error('onboarding-chat model', e instanceof Error ? e.message : e);
        // The conversation must never stall on a model error: fall back to plain wording.
        if (!text.trim()) {
          text = slot ? fallbackLine(slot, s) : 'You are all set.';
          controller.enqueue(sse({ type: 'delta', text }));
        }
      }

      // A follow-up keeps the same question open, once.
      let pendingSlot = slot;
      if (followedUp && last) {
        s.chat.answered = s.chat.answered.filter((k) => k !== last!.slot.key);
        s.chat.followups[last.slot.key] = (s.chat.followups[last.slot.key] ?? 0) + 1;
        pendingSlot = last.slot;
      }
      const clean = text.replace(/\s*[—–]\s*/g, ', ').trim();
      s.chat.messages.push({ role: 'assistant', text: clean, slot: pendingSlot?.key ?? 'end' });
      // The closing message needs no answer.
      if (pendingSlot?.kind === 'done') s.chat.answered.push('done');
      await saveChat(admin, s).catch((e) => console.error('onboarding-chat save', e));
      const spec = specFor(pendingSlot, s);
      if (followedUp && spec) delete spec.draft;
      controller.enqueue(
        sse({ type: 'done', pending: pendingSlot?.kind === 'done' ? { key: 'done', kind: 'done' } : spec, progress: progressOf(s) }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
});

/** Plain wording for when the model cannot be reached. */
function fallbackLine(slot: Slot, s: State): string {
  const lines: Record<string, string> = {
    website: `Hi${s.firstName ? ` ${s.firstName}` : ''}, I'm Noni. A few quick questions and your first videos are moving. What's your website?`,
    goal: 'What should the videos do first?',
    platforms: 'Where should the videos go?',
    creators_wanted: 'How many creators do you want posting?',
    monthly_budget: "What's your monthly UGC budget?",
    launch: 'When do you want the first videos live?',
    does_ugc: 'Do you already work with creators?',
    runs_campaigns: 'Should Noni run it all for you, or will you or your team run it?',
    sells: `Which line says best what ${s.companyName} does?`,
    audience: 'Who are you selling to?',
    price: 'What does it cost?',
    cta: 'What should a viewer do right after watching?',
    never_say: 'Anything creators must never say or show?',
    voice: 'How should creators sound?',
    must_show: 'What does every video have to show or say?',
    competitors: 'Who do you compete with?',
    summary: "That's everything. Here's what I understood about your company.",
    done: "You're all set.",
  };
  return lines[slot.key] ?? 'Next question.';
}
