// Applying to Noni, as a conversation (web /apply).
//
// Anyone can sign in with Google now; what they get is an application, not
// access. A company answers the basics a UGC agency asks on a first call. A
// creator builds their resume: main Instagram and TikTok, experience, best
// work, niches. The creator questions branch on experience: someone who has
// done paid UGC is asked about their campaigns, someone brand new is told
// what UGC is and asked what they are comfortable filming instead.
//
// Same wire format as onboarding-chat, so the web reuses its chat UI. The
// agenda is fixed here; the model (Haiku) only writes the words. When the
// last question is answered the application goes to review and the founders
// get an email (a row in leads). The platform admin decides in /ops.
//
// POST { action: 'state', kind? }
//   200 { applications: [{ id, kind, status, decision_note }], has_profile,
//         messages?, pending?, first_name?, progress? }   (chat fields with kind)
// POST { action: 'start', kind }      creates the draft if there is none
// POST { action: 'turn', kind, answer?: { slot, value, text } }
//   200 text/event-stream: { type: 'delta', text } | { type: 'done', pending, progress, status }
// POST { action: 'first_scan' }       an approved company's first visit: read their site once
// POST { action: 'list' }                                  platform admin
// POST { action: 'decide', id, decision: 'approve'|'reject', note? }   platform admin
//
// Signed-in users only. An applicant has no profile, so this checks the
// token itself instead of wp8.authenticate.

import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { type EmailContent, greet, sendEmail } from '../_shared/email.ts';
import { adminClient, corsHeaders, handleCors, jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MODEL = Deno.env.get('NONI_ONBOARDING_CHAT_MODEL') ?? 'claude-haiku-5-5';
const WEB_URL = 'https://www.usenoni.app';

type Kind = 'company' | 'creator';
type Option = { value: string; label: string };
type SlotKind = 'choice' | 'multi' | 'text' | 'age' | 'done';

type Slot = {
  key: string;
  kind: SlotKind;
  ask: string;
  options?: Option[];
  placeholder?: string;
  followUp?: boolean;
  /** Most picks for a multi. */
  max?: number;
  when?: (a: Answers) => boolean;
};

type Answers = Record<string, string | string[]>;

export type SlotSpec = { key: string; kind: SlotKind; options?: Option[]; placeholder?: string; draft?: string; max?: number };

// ---------------------------------------------------------------- agendas

const COMPANY: Slot[] = [
  {
    key: 'company_name',
    kind: 'text',
    ask: "First message. Say hi with their first name, say you are Noni, and say you have a few quick questions before you get started (use those words). Ask the name of their company. Under 30 words.",
    placeholder: 'Company name',
  },
  {
    key: 'website',
    kind: 'text',
    ask: 'Ask for their website.',
    placeholder: 'yourcompany.com',
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
    kind: 'choice',
    ask: 'Ask how many creators they want posting. Mention creators on Noni apply to brands, so they pick who they like.',
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
  {
    key: 'done',
    kind: 'done',
    ask: 'Close in one short sentence: that is everything, and there is one last choice on the next screen. No question.',
  },
];

const experienced = (a: Answers) => a.experience === 'pro' || a.experience === 'some';
const brandNew = (a: Answers) => a.experience === 'new';

const CREATOR: Slot[] = [
  {
    key: 'age',
    kind: 'age',
    ask: "Say that brands on Noni pay creators to make short videos, and a few quick questions build their creator profile (only if nothing has been said yet in this chat, open with hi, their first name and that you are Noni). Ask how old they are, and say some campaigns are 18+. Under 35 words.",
  },
  {
    key: 'gender',
    kind: 'choice',
    ask: 'Ask their gender, and say brands sometimes look for a certain creator.',
    options: [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      { value: 'nonbinary', label: 'Non-binary' },
      { value: 'undisclosed', label: 'Prefer not to say' },
    ],
  },
  {
    key: 'country',
    kind: 'choice',
    ask: 'Ask where they live.',
    options: [
      { value: 'US', label: 'United States' },
      { value: 'CA', label: 'Canada' },
      { value: 'GB', label: 'United Kingdom' },
      { value: 'AU', label: 'Australia' },
    ],
    placeholder: 'Or type your country',
  },
  {
    key: 'languages',
    kind: 'multi',
    max: 5,
    ask: 'Ask what languages they speak, up to five.',
    options: [
      { value: 'english', label: 'English' },
      { value: 'spanish', label: 'Spanish' },
      { value: 'portuguese', label: 'Portuguese' },
      { value: 'french', label: 'French' },
      { value: 'german', label: 'German' },
      { value: 'italian', label: 'Italian' },
      { value: 'dutch', label: 'Dutch' },
      { value: 'arabic', label: 'Arabic' },
      { value: 'hindi', label: 'Hindi' },
      { value: 'urdu', label: 'Urdu' },
      { value: 'bengali', label: 'Bengali' },
      { value: 'chinese', label: 'Chinese' },
      { value: 'japanese', label: 'Japanese' },
      { value: 'korean', label: 'Korean' },
      { value: 'vietnamese', label: 'Vietnamese' },
      { value: 'thai', label: 'Thai' },
      { value: 'indonesian', label: 'Indonesian' },
      { value: 'tagalog', label: 'Tagalog' },
      { value: 'turkish', label: 'Turkish' },
      { value: 'russian', label: 'Russian' },
    ],
  },
  {
    key: 'experience',
    kind: 'choice',
    ask: 'Ask if they have done UGC before.',
    options: [
      { value: 'pro', label: "Yes, I've done paid UGC" },
      { value: 'some', label: 'A little' },
      { value: 'new', label: "No, I'm brand new" },
    ],
  },
  {
    key: 'ugc_basics',
    kind: 'choice',
    when: brandNew,
    ask: 'They are brand new, so teach them in three short plain sentences: UGC is a short video that looks like a normal post, made for a brand. On Noni the brand gives you a simple brief, you film on your phone and post it. You earn $10 a video plus $1 for every 1,000 views. Then ask if that makes sense.',
    options: [{ value: 'got_it', label: "Got it, I'm in" }],
    placeholder: 'Or ask me anything about it',
  },
  {
    key: 'instagram',
    kind: 'choice',
    ask: 'Ask for their main Instagram handle.',
    options: [{ value: 'none', label: "I don't use Instagram" }],
    placeholder: '@yourhandle',
  },
  {
    key: 'tiktok',
    kind: 'choice',
    ask: 'Ask for their main TikTok handle.',
    options: [{ value: 'none', label: "I don't use TikTok" }],
    placeholder: '@yourhandle',
  },
  {
    key: 'campaigns_done',
    kind: 'choice',
    when: experienced,
    ask: 'Ask how many UGC campaigns they have done.',
    options: [
      { value: '1-5', label: '1 to 5' },
      { value: '5-20', label: '5 to 20' },
      { value: '20+', label: 'More than 20' },
    ],
  },
  {
    key: 'best_campaign',
    kind: 'text',
    when: experienced,
    followUp: true,
    ask: 'Ask about the campaign they are proudest of: which brand, and how it did.',
    placeholder: 'The brand, what you made, how it did',
  },
  {
    key: 'portfolio',
    kind: 'text',
    when: experienced,
    ask: 'Ask them to paste links to their best videos. Say these become their resume that brands see when they apply.',
    placeholder: 'Paste links, one per line',
  },
  {
    key: 'starter_videos',
    kind: 'choice',
    when: brandNew,
    ask: 'Ask if they have any videos they are proud of, even just for fun. They can paste links, or skip.',
    options: [{ value: 'none', label: 'Not yet' }],
    placeholder: 'Paste links, one per line',
  },
  {
    key: 'niches',
    kind: 'multi',
    max: 5,
    ask: 'Ask what they post about, up to five. Say brands use these to find them.',
    options: [
      { value: 'social', label: 'Social and communication' },
      { value: 'finance', label: 'Finance and commerce' },
      { value: 'entertainment', label: 'Entertainment and media' },
      { value: 'music', label: 'Music' },
      { value: 'fitness', label: 'Health and fitness' },
      { value: 'education', label: 'Education and learning' },
      { value: 'travel', label: 'Travel and local' },
      { value: 'lifestyle', label: 'Lifestyle' },
      { value: 'tech', label: 'Tech and AI' },
      { value: 'photo_video', label: 'Photo and video' },
      { value: 'food', label: 'Food and drink' },
      { value: 'home_family', label: 'Home and family' },
      { value: 'fashion_beauty', label: 'Fashion and beauty' },
      { value: 'sports', label: 'Sports' },
      { value: 'gaming', label: 'Gaming' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    key: 'found_via',
    kind: 'choice',
    ask: 'Last one. Ask how they found Noni.',
    options: [
      { value: 'tiktok', label: 'TikTok' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'x', label: 'X' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'snapchat', label: 'Snapchat' },
      { value: 'linkedin', label: 'LinkedIn' },
      { value: 'google', label: 'Google' },
      { value: 'chatgpt', label: 'ChatGPT' },
      { value: 'claude', label: 'Claude' },
      { value: 'podcast', label: 'Podcast' },
      { value: 'newsletter', label: 'Blog or newsletter' },
      { value: 'friend', label: 'A friend' },
      { value: 'invite_code', label: 'Invite code' },
    ],
  },
  {
    key: 'done',
    kind: 'done',
    ask: 'Close in two short sentences: their profile is done and they are in. Next they get the Noni app to browse brands and apply to campaigns.',
  },
];

const AGENDAS: Record<Kind, Slot[]> = { company: COMPANY, creator: CREATOR };

// ---------------------------------------------------------------- state

type ChatMessage = { role: 'assistant' | 'user'; text: string; slot: string };
type ChatState = { messages: ChatMessage[]; answered: string[]; followups: Record<string, number> };

type App = {
  id: string;
  kind: Kind;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  full_name: string | null;
  email: string | null;
  chat: Partial<ChatState>;
  answers: Answers;
  decision_note: string | null;
};

type State = { app: App; chat: ChatState; firstName: string; userId: string };

function stateOf(app: App, userId: string): State {
  const raw = app.chat ?? {};
  return {
    app,
    userId,
    firstName: String(app.full_name ?? '').trim().split(/\s+/)[0] ?? '',
    chat: { messages: raw.messages ?? [], answered: raw.answered ?? [], followups: raw.followups ?? {} },
  };
}

function nextSlot(s: State): Slot | null {
  return (
    AGENDAS[s.app.kind].find((slot) => !s.chat.answered.includes(slot.key) && (slot.when ? slot.when(s.app.answers) : true)) ??
    null
  );
}

/** Answered out of everything that applies to them so far. */
function progressOf(s: State): { at: number; total: number } {
  const asked = AGENDAS[s.app.kind].filter((x) => x.kind !== 'done' && (x.when ? x.when(s.app.answers) : true));
  return { at: asked.filter((x) => s.chat.answered.includes(x.key)).length, total: asked.length };
}

function specFor(slot: Slot | null): SlotSpec | null {
  if (!slot) return null;
  return {
    key: slot.key,
    kind: slot.kind,
    ...(slot.options ? { options: slot.options } : {}),
    ...(slot.placeholder ? { placeholder: slot.placeholder } : {}),
    ...(slot.max ? { max: slot.max } : {}),
  };
}

function wwwHost(url: string): string {
  const host = url.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (!host) return '';
  return host.startsWith('www.') ? host : `www.${host}`;
}

function handle(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  // A pasted profile link becomes the handle.
  const fromUrl = t.match(/(?:instagram\.com|tiktok\.com)\/@?([A-Za-z0-9._]+)/i)?.[1];
  const h = (fromUrl ?? t.split(/\s+/)[0]).replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '');
  return h ? `@${h}` : null;
}

function links(raw: string): { url: string }[] {
  const found = raw.match(/(https?:\/\/[^\s,]+|(?:www\.)?(?:tiktok|instagram|youtube|youtu|drive\.google|vimeo)\.[a-z]+\/[^\s,]+)/gi) ?? [];
  return [...new Set(found.map((u) => (u.startsWith('http') ? u : `https://${u}`)))].slice(0, 12).map((url) => ({ url }));
}

// ---------------------------------------------------------------- saving

async function saveAnswer(admin: SupabaseClient, s: State, slot: Slot, value: string | string[], text: string): Promise<void> {
  const one = Array.isArray(value) ? value[0] ?? '' : value;
  let stored: string | string[] = one;
  // A written answer, or words typed instead of tapping a choice.
  if (slot.kind === 'text' || (slot.kind === 'choice' && !slot.options?.some((o) => o.value === one))) stored = (text || one).trim();
  if (slot.kind === 'multi') stored = Array.isArray(value) ? value : [value];
  if (slot.key === 'website') stored = wwwHost(text || one);
  if (slot.key === 'company_name') stored = (text || one).trim().slice(0, 80);
  s.app.answers = { ...s.app.answers, [slot.key]: stored };

  if (s.app.kind !== 'creator') return;
  const patch: Record<string, unknown> = {};
  const typed = typeof stored === 'string' ? stored : '';
  switch (slot.key) {
    case 'age': {
      const age = Math.round(Number(one));
      if (Number.isFinite(age) && age >= 13 && age <= 100) patch.birth_year = new Date().getUTCFullYear() - age;
      break;
    }
    case 'gender':
      if (['female', 'male', 'nonbinary', 'undisclosed'].includes(one)) patch.gender = one;
      break;
    case 'country':
      patch.country = typed.slice(0, 60);
      break;
    case 'found_via':
      patch.found_via = typed.slice(0, 60);
      break;
    case 'experience':
      if (['pro', 'some', 'new'].includes(one)) patch.experience = one;
      break;
    case 'instagram':
    case 'tiktok':
      patch[slot.key] = one === 'none' ? null : handle(typed);
      break;
    case 'campaigns_done':
      patch.campaigns_done = typed;
      break;
    case 'best_campaign':
      patch.best_campaign = typed;
      break;
    case 'portfolio':
    case 'starter_videos':
      patch.portfolio = one === 'none' ? [] : links(typed);
      break;
    case 'niches':
      patch.niches = Array.isArray(stored) ? stored.slice(0, 5) : stored;
      break;
    case 'languages':
      patch.languages = (Array.isArray(stored) ? stored : [stored]).map((l) => String(l).toLowerCase().trim()).filter(Boolean).slice(0, 5);
      break;
  }
  if (Object.keys(patch).length) {
    const { error } = await admin
      .from('creator_profiles')
      .upsert({ user_id: s.userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
  }
}

async function saveApp(admin: SupabaseClient, s: State, extra: Record<string, unknown> = {}): Promise<void> {
  const chat = { ...s.chat, messages: s.chat.messages.slice(-80) };
  const { error } = await admin
    .from('applications')
    .update({ chat, answers: s.app.answers, updated_at: new Date().toISOString(), ...extra })
    .eq('id', s.app.id);
  if (error) throw error;
}

/** Finished. A creator goes into review; a company is let straight in (its
    workspace is made now) and picks next whether it runs the campaigns
    itself or Noni does it for them. The founders hear about both through
    leads (notify-lead). */
async function submit(admin: SupabaseClient, s: State): Promise<void> {
  s.app.status = 'pending';
  await saveApp(admin, s, { status: 'pending', submitted_at: new Date().toISOString() });
  /* Creators are in as soon as the profile is done: there is no call and
     no review. Brands decide who they work with when creators apply to
     their campaigns. */
  {
    const { error } = await admin.rpc('approve_application', { p_id: s.app.id, p_note: 'Signed up on the website' });
    if (error) console.error('apply-chat auto approve', error.message);
    else s.app.status = 'approved';
  }
  const a = s.app.answers;
  const lines = Object.entries(a).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  await admin.from('leads').insert({
    kind: s.app.kind === 'company' ? 'business' : 'creator',
    name: s.app.full_name ?? s.app.email ?? 'Applicant',
    email: s.app.email,
    company: s.app.kind === 'company' ? String(a.company_name ?? '') || null : null,
    website: s.app.kind === 'company' ? String(a.website ?? '') || null : null,
    message: s.app.kind === 'company'
      ? `Signed up on the website. Next they pick do it yourself or done for you.\n\n${lines.join('\n')}`
      : `Joined as a creator on the website.\n\n${lines.join('\n')}`,
    source: 'apply',
  });
}

// ---------------------------------------------------------------- the model

const SYSTEM = `You are Noni, a UGC platform where brands pay creators to make short videos, talking to someone applying in a chat. You are warm, sharp and quick. Each turn the app tells you what to ask next; your job is the words.

How you write:
- Short. Under 25 words per message unless the instruction says to explain something. At most one quick line reacting to what they said, then the question.
- It should feel like momentum, never like a form.
- A reaction must be specific to what they said, never generic praise ("Great!", "Love it", "Awesome"). Do not repeat their answer back to them.
- Plain words. No em dashes or en dashes, no emoji, no exclamation marks, no hype words, no filler ("seamless", "empower", "unlock", "game-changer", "dive in", "elevate").
- Never invent facts about them.
- If they asked a question instead of answering, answer it in a sentence or two, then ask again.
- The answer choices are shown to them as buttons under your message. NEVER list, name or paraphrase choices in your message; just ask the question.
- Address them as "you". Use their first name only in your first message.
- Do not include internal or system XML tags in your response.`;

const FOLLOW_UP_TOOL = {
  name: 'follow_up',
  description:
    'Call this after your message when, instead of moving on, your message asked one follow-up about their last written answer because it was too thin to understand. Do not call it when you moved on to the next question.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      reason: { type: 'string', description: 'What was missing, in a few words.' },
      question: {
        type: 'string',
        description: 'The one follow-up question your message asks them, word for word, ending with a question mark.',
      },
    },
    required: ['reason', 'question'],
  },
};

function turnInstruction(s: State, slot: Slot | null, last: { slot: Slot; text: string; mayFollowUp: boolean } | null): string {
  const who = s.app.kind === 'company' ? 'a company applying to find creators' : 'a creator applying to work with brands';
  const parts = [`They are ${who}. Name: ${s.firstName || 'unknown'}.`];
  const a = s.app.answers;
  if (s.app.kind === 'company' && a.company_name) parts.push(`Company: ${a.company_name}${a.website ? ` (${a.website})` : ''}`);
  if (last) {
    parts.push(`They just answered "${last.slot.key}": ${last.text}`);
    if (last.mayFollowUp) {
      parts.push('If that answer is too thin to understand, ask ONE short follow-up about it instead of moving on, and call the follow_up tool. Otherwise move on.');
    }
  }
  if (slot) parts.push(`Next: ${slot.ask}`);
  return parts.join('\n\n');
}

function fallbackLine(slot: Slot, s: State): string {
  const hi = `Hi${s.firstName ? ` ${s.firstName}` : ''}, I'm Noni.`;
  const lines: Record<string, string> = {
    company_name: `${hi} A few quick questions and you're set up with creators. What's your company called?`,
    website: "What's your website?",
    goal: 'What should the videos do first?',
    platforms: 'Where should the videos go?',
    creators_wanted: 'How many creators do you want posting?',
    monthly_budget: "What's your monthly UGC budget?",
    launch: 'When do you want the first videos live?',
    runs_campaigns: 'Who will run the campaigns day to day?',
    experience: `${hi} Brands on Noni pay creators to make short videos. Have you done UGC before?`,
    ugc_basics:
      'UGC is a short video that looks like a normal post, made for a brand. You get a simple brief, film on your phone and post it. You earn $10 a video plus $1 for every 1,000 views. Make sense?',
    instagram: "What's your main Instagram?",
    tiktok: "What's your main TikTok?",
    campaigns_done: 'How many UGC campaigns have you done?',
    best_campaign: "What's the campaign you're proudest of?",
    portfolio: 'Paste links to your best videos. Brands see them when you apply.',
    starter_videos: 'Any videos you are proud of? Paste links, or skip.',
    niches: 'What do you make content about?',
    languages: 'What languages do you speak?',
    done: "That's it. Your application is in and we'll email you soon.",
  };
  return lines[slot.key] ?? 'Next question.';
}

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

// ---------------------------------------------------------------- decisions

async function sendDecisionEmail(app: App, approved: boolean, note: string | null): Promise<void> {
  if (!Deno.env.get('RESEND_API_KEY') || !app.email) return;
  const name = typeof app.full_name === 'string' ? app.full_name : null;
  const company = app.kind === 'company';
  const subject = approved
    ? company
      ? "You're in. Your Noni workspace is open"
      : "You're in. Welcome to Noni"
    : 'About your Noni application';
  const content: EmailContent = approved
    ? company
      ? {
          preview: 'Sign in with Google to set up your first campaign.',
          heading: "You're in. Your workspace is open",
          paragraphs: [
            greet(name, "we read your application and we'd love to work with you. Your Noni workspace is open and ready to set up."),
          ],
          cta: { label: 'Open your workspace', url: `${WEB_URL}/apply` },
          steps: [
            `Sign in with Google as ${app.email}.`,
            'Answer a few quick questions while Noni reads your website.',
            'Pick a plan and your creators can start posting.',
          ],
        }
      : {
          preview: 'Sign in and start applying to brands.',
          heading: "You're in. Welcome to Noni",
          paragraphs: [
            greet(name, "you're approved as a Noni creator. Brands post what they need, you apply to the ones you like, and you get paid for every post that goes live."),
          ],
          cta: { label: 'Sign in to Noni', url: `${WEB_URL}/apply` },
          steps: [
            `Sign in with Google as ${app.email}.`,
            'Get the Noni app on your iPhone.',
            'Apply to brands in the Market tab.',
          ],
        }
    : {
        preview: 'An update on your application.',
        heading: 'About your Noni application',
        paragraphs: [
          greet(name, "thanks for applying to Noni. We can't take you on right now."),
          ...(note ? [note] : []),
          "You're welcome to apply again later.",
        ],
      };
  try {
    await sendEmail({ to: app.email, subject, content });
  } catch (e) {
    console.error('apply-chat email', e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const admin = adminClient();
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    action?: string;
    kind?: string;
    id?: string;
    decision?: string;
    note?: string;
    answer?: { slot?: string; value?: string | string[]; text?: string };
    /** What they said on the website before signing in. */
    name?: string;
    intro?: unknown;
  };
  const kind: Kind | null = body.kind === 'company' || body.kind === 'creator' ? body.kind : null;

  const { data: profile } = await admin.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
  const platformAdmin = profile?.role === 'admin';

  // ------------------------------------------------ admin: list and decide
  if (body.action === 'list' || body.action === 'decide') {
    if (!platformAdmin) return jsonResponse({ error: 'forbidden' }, 403);
    if (body.action === 'list') {
      const { data, error } = await admin
        .from('applications')
        .select('id, kind, status, email, full_name, answers, submitted_at, decided_at, decision_note, company_id, user_id')
        .neq('status', 'draft')
        .order('submitted_at', { ascending: false })
        .limit(200);
      if (error) return jsonResponse({ error: error.message }, 500);
      const creatorIds = (data ?? []).filter((a) => a.kind === 'creator').map((a) => a.user_id);
      const { data: resumes } = creatorIds.length
        ? await admin.from('creator_profiles').select('*').in('user_id', creatorIds)
        : { data: [] };
      const byUser = new Map((resumes ?? []).map((r) => [r.user_id, r]));
      return jsonResponse({ applications: (data ?? []).map((a) => ({ ...a, resume: byUser.get(a.user_id) ?? null })) });
    }
    if (!body.id || (body.decision !== 'approve' && body.decision !== 'reject')) {
      return jsonResponse({ error: 'expected { id, decision }' }, 400);
    }
    const note = body.note?.trim() || null;
    const { data: decided, error } = await admin.rpc(body.decision === 'approve' ? 'approve_application' : 'reject_application', {
      p_id: body.id,
      p_note: note,
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    const app = decided as App & { user_id: string };
    await admin.from('applications').update({ decided_by: user.id }).eq('id', app.id);
    EdgeRuntime.waitUntil(sendDecisionEmail(app, body.decision === 'approve', note).catch((e) => console.error('apply-chat email', e)));
    return jsonResponse({ application: app });
  }

  // ------------------------------------------------ applicant
  const { data: mine } = await admin
    .from('applications')
    .select('id, kind, status, full_name, email, chat, answers, decision_note')
    .eq('user_id', user.id);
  const apps = (mine ?? []) as App[];
  const summary = apps.map((a) => ({ id: a.id, kind: a.kind, status: a.status, decision_note: a.decision_note }));

  if (body.action === 'state') {
    const app = kind ? apps.find((a) => a.kind === kind) : null;
    if (!app) return jsonResponse({ applications: summary, has_profile: Boolean(profile) });
    const s = stateOf(app, user.id);
    return jsonResponse({
      applications: summary,
      has_profile: Boolean(profile),
      messages: s.chat.messages,
      pending: s.chat.messages.length ? specFor(nextSlot(s)) : null,
      first_name: s.firstName,
      company_name: String(app.answers.company_name ?? ''),
      progress: progressOf(s),
      status: app.status,
    });
  }

  // An approved company's first visit: start reading their site, once, so
  // the briefs have something to work from. Runs as them (brain-ingest
  // works on the caller's active company).
  if (body.action === 'first_scan') {
    const { data: won } = await admin
      .from('applications')
      .select('company_id, answers')
      .eq('user_id', user.id)
      .eq('kind', 'company')
      .eq('status', 'approved')
      .maybeSingle();
    const website = String((won?.answers as Answers | undefined)?.website ?? '').trim();
    if (!won?.company_id || !website) return jsonResponse({ started: false });
    const { data: ran } = await admin.from('brain_ingest').select('company_id').eq('company_id', won.company_id).maybeSingle();
    if (ran) return jsonResponse({ started: false });
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/brain-ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', website: `https://${website}`, import_legacy: false }),
    });
    if (!res.ok) console.error('apply-chat first_scan', res.status, await res.text());
    return jsonResponse({ started: res.ok });
  }

  if (!kind) return jsonResponse({ error: 'expected kind: company or creator' }, 400);

  // The first lines of the chat, said on the website before signing in
  // ("What should I call you?", "Company or creator?"), carried into the
  // conversation so it picks up from there.
  const name = String(body.name ?? '').trim().slice(0, 80) || null;
  const intro = Array.isArray(body.intro)
    ? (body.intro as unknown[])
        .slice(0, 6)
        .map((m) => m as { role?: unknown; text?: unknown; slot?: unknown })
        .filter((m) => (m.role === 'assistant' || m.role === 'user') && typeof m.text === 'string' && m.text.trim())
        .map((m) => ({ role: m.role as 'assistant' | 'user', text: String(m.text).trim().slice(0, 300), slot: String(m.slot ?? 'intro') }))
    : [];


  if (body.action === 'start') {
    const existing = apps.find((a) => a.kind === kind);
    if (existing && existing.status !== 'rejected') return jsonResponse({ application: existing });
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = name ?? (String(meta.full_name ?? meta.name ?? '').trim() || null);
    const row = {
      user_id: user.id,
      kind,
      status: 'draft',
      email: user.email?.toLowerCase() ?? null,
      full_name: fullName,
      chat: intro.length ? { messages: intro, answered: [], followups: {} } : {},
      answers: {},
      submitted_at: null,
      decided_at: null,
      decided_by: null,
      decision_note: null,
    };
    const { data, error } = await admin.from('applications').upsert(row, { onConflict: 'user_id,kind' }).select('*').single();
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ application: data });
  }

  // A company signing up on the website gets its workspace at once, with a
  // placeholder name, and goes straight into the onboarding chat (which asks
  // its name, website and everything else). No questions here, no review.
  if (body.action === 'join_company') {
    if (kind !== 'company') return jsonResponse({ error: 'Companies only' }, 400);
    let app = apps.find((a) => a.kind === 'company');
    if (app?.status === 'approved') return jsonResponse({ company_id: (app as App & { company_id?: string }).company_id ?? null });
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = name ?? (String(meta.full_name ?? meta.name ?? '').trim() || null);
    const { data: row, error } = await admin
      .from('applications')
      .upsert(
        {
          user_id: user.id,
          kind: 'company',
          status: 'pending',
          email: user.email?.toLowerCase() ?? null,
          full_name: fullName,
          chat: {},
          answers: {},
          submitted_at: new Date().toISOString(),
          decided_at: null,
          decided_by: null,
          decision_note: null,
        },
        { onConflict: 'user_id,kind' },
      )
      .select('*')
      .single();
    if (error || !row) return jsonResponse({ error: error?.message ?? 'Could not sign you up' }, 500);
    app = row as App;
    const { data: approved, error: approveError } = await admin.rpc('approve_application', {
      p_id: app.id,
      p_note: 'Signed up on the website',
    });
    if (approveError) return jsonResponse({ error: approveError.message }, 500);
    const companyId = (approved as { company_id?: string } | null)?.company_id ?? null;
    // Approval counts setup as done; here the onboarding chat is still ahead.
    if (companyId) {
      await admin
        .from('companies')
        .update({ onboarded_at: null, ...(intro.length ? { onboarding_chat: { messages: intro, answered: [], followups: {} } } : {}) })
        .eq('id', companyId);
    }
    await admin
      .from('profiles')
      .update({ onboarded: false, ...(name ? { full_name: name } : {}) })
      .eq('id', user.id);
    await admin.from('leads').insert({
      kind: 'business',
      name: fullName ?? user.email ?? 'New company',
      email: user.email ?? '',
      message: 'Signed up on the website. They are in the onboarding chat now.',
      source: 'apply',
    });
    return jsonResponse({ company_id: companyId });
  }

  if (body.action !== 'turn') return jsonResponse({ error: 'Unknown action' }, 400);
  const app = apps.find((a) => a.kind === kind);
  if (!app) return jsonResponse({ error: 'Start the application first' }, 400);
  if (app.status !== 'draft') return jsonResponse({ error: 'This application is already in' }, 400);
  const s = stateOf(app, user.id);

  // 1. Save the answer to the open question.
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
  } else if (s.chat.messages.length && !body.answer && s.chat.messages[s.chat.messages.length - 1].role !== 'user') {
    return jsonResponse({ error: 'Answer the question first' }, 400);
  }

  // A typed question on the explainer is answered, and the explainer asked again.
  const askedBack = last?.slot.key === 'ugc_basics' && body.answer?.value !== 'got_it' && /\?\s*$/.test(last.text);
  if (askedBack && last) s.chat.answered = s.chat.answered.filter((k) => k !== 'ugc_basics');

  const slot = nextSlot(s);

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
        let instruction = turnInstruction(s, slot, last);
        if (askedBack) instruction += '\n\nThey asked a question about UGC. Answer it plainly in one or two sentences, then ask if they are in.';
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
        const followUp = final.content.find((b) => b.type === 'tool_use' && b.name === 'follow_up') as
          | { input?: { question?: unknown } }
          | undefined;
        followedUp = Boolean(followUp);
        // The tool call ends the turn, so a message that only announced the
        // follow-up ("I'll ask for a bit more.") would never ask it: add it.
        const question = String(followUp?.input?.question ?? '').replace(/\s*[—–]\s*/g, ', ').trim();
        if (followedUp && question && !/\?\s*$/.test(text.trim())) {
          const add = (text.trim() ? ' ' : '') + question;
          text += add;
          controller.enqueue(sse({ type: 'delta', text: add }));
        }
      } catch (e) {
        console.error('apply-chat model', e instanceof Error ? e.message : e);
        if (!text.trim()) {
          text = slot ? fallbackLine(slot, s) : 'You are all set.';
          controller.enqueue(sse({ type: 'delta', text }));
        }
      }

      let pendingSlot = slot;
      if (followedUp && last) {
        s.chat.answered = s.chat.answered.filter((k) => k !== last!.slot.key);
        s.chat.followups[last.slot.key] = (s.chat.followups[last.slot.key] ?? 0) + 1;
        pendingSlot = last.slot;
      }
      const clean = text.replace(/\s*[—–]\s*/g, ', ').trim();
      s.chat.messages.push({ role: 'assistant', text: clean, slot: pendingSlot?.key ?? 'end' });
      try {
        if (pendingSlot?.kind === 'done') {
          s.chat.answered.push('done');
          await submit(admin, s);
        } else await saveApp(admin, s);
      } catch (e) {
        console.error('apply-chat save', e instanceof Error ? e.message : e);
      }
      controller.enqueue(
        sse({
          type: 'done',
          pending: pendingSlot?.kind === 'done' ? { key: 'done', kind: 'done' } : specFor(pendingSlot),
          progress: progressOf(s),
          status: s.app.status,
        }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
});
