// write-deck chat mode: the idea chat for campaign managers. Prompt pieces
// and the pure clean up of what the model answers; index.ts does the I/O.
// Nothing here touches the network, so chat_test.ts runs it as is.

import { dropColons, overlap, slopHits, words } from './checks.ts';
import { POST_TYPE_LIST, specFor, storyShape, type Format, type Kind } from './specs.ts';

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type ChatIdea = {
  format: Format;
  post_type_id: string;
  kind: Kind;
  cover: string;
  say: string;
  count: number;
  angle: string;
  preview: string[];
};

export type ChatOut = { reply: string; ideas: ChatIdea[]; chips: string[] };

/** What the model answers before clean up. */
export type ChatRaw = {
  reply?: unknown;
  ideas?: {
    format?: unknown;
    post_type_id?: unknown;
    kind?: unknown;
    cover?: unknown;
    say?: unknown;
    count?: unknown;
    angle?: unknown;
    preview?: unknown;
  }[];
  chips?: unknown;
};

/** Turns the model reads; older ones drop off. */
export const CHAT_KEEP = 16;
const TURN_CHARS = 1500;
const MAX_IDEAS = 4;

export const DEFAULT_CHIPS = ['More like these', 'Give me a reel version', 'Make it more contrarian'];

/** The chat as sent: valid roles, trimmed, empty turns out, the last CHAT_KEEP only. */
export function chatTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const r = m as { role?: unknown; text?: unknown };
    const text = typeof r.text === 'string' ? r.text.trim().slice(0, TURN_CHARS) : '';
    if (!text) continue;
    out.push({ role: r.role === 'assistant' ? 'assistant' : 'user', text });
  }
  return out.slice(-CHAT_KEEP);
}

/** Every post type the editor offers, with its range and spec, for the model to pick from. */
export function chatTypesBlock(): string {
  const lines: string[] = ['POST TYPES (every idea is exactly one of these; post_type_id is the id in brackets):'];
  for (const format of ['slideshow', 'reel'] as Format[]) {
    lines.push(format === 'slideshow' ? 'SLIDESHOWS:' : 'REELS:');
    for (const t of POST_TYPE_LIST[format]) {
      const spec = specFor(format, t.id);
      const range = t.id === 'longtext' ? 'no body slides, count 0' : `${t.min} to ${t.max} body slides, CTA included`;
      lines.push(`- [${t.id}] ${t.name} (${range}). ${spec.what} COVER: ${spec.cover}`);
    }
  }
  lines.push(
    'KIND: handheld means the manager writes every slide (the usual pick). story means the manager sets only the cover and CTA and each creator tells their own version; pick story only when the idea lives on each creator\'s own experience. Long text is always handheld.',
  );
  return lines.join('\n');
}

export function chatTask(productName: string): string {
  return [
    `TASK: you are the sharpest UGC strategist on this team, chatting with a campaign manager who is stuck for ideas. Talk like a teammate in a DM: short, plain, direct, no hype, no markdown, no lists in the reply.`,
    'Usually just pitch. Pitch 3 or 4 ideas a turn, each a different problem or moment in the audience\'s year, each a post a strict manager approves on sight: a real problem this audience has now, narrow enough to deliver in one post, something a player would save or send to a teammate, close enough to a feature that the CTA lands naturally. Ask one short clarifying question with zero ideas only when the ask truly makes no sense.',
    'REJECTED ideas are ones the manager or this team tapped X on: they disliked them. Never pitch those again, and never pitch anything close: not the same topic, not the same angle, not the same cover template with a word swapped. Read what they have in common and steer away from it.',
    'When the manager asks to fill empty slots, pitch for the formats that still have empty slots, most empty first. When the manager names a format, every idea is that format. "More like: <cover>" means fresh ideas with the same angle, audience and post type, never that cover again. Never pitch a topic already in this week, posted recently or already pitched in this chat.',
    `ANSWER with one JSON object and nothing else: {"reply": string, "ideas": [{"format": "slideshow" | "reel", "post_type_id": string, "kind": "handheld" | "story", "cover": string, "say": string, "count": number, "angle": string, "preview": string[]}], "chips": string[]}.`,
    'reply: 1 to 3 short sentences to the manager. Never list or restate the ideas (they show as cards) and never say how many there are.',
    'cover follows that post type\'s COVER rule. say: for reels the first line the creator says out loud, 5 to 12 words (for Long text, what the creator does on camera); for slideshows an empty string. count: body slides including the CTA, inside that type\'s range; when the cover names a number, count is that number; 0 for story kind and Long text. angle: one plain sentence to the manager on why it earns saves or sends, naming the detail it hinges on. preview: the first 3 slide headers (slideshows) or beats (reels), 2 to 8 words each, in order, numbered types without the number.',
    `chips: 2 to 4 follow ups the manager might tap next, 2 to 6 words each, said as the manager talking to you ("Make it more contrarian", "Give me a reel version", "Something for beginners"). Never a chip that only ${productName} staff would understand.`,
  ].join('\n');
}

/** Covers the client sent as dismissed in this chat: trimmed, deduped, the last 30. */
export function chatRejected(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    const c = typeof t === 'string' ? t.trim().slice(0, 300) : '';
    if (c && !out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out.slice(-30);
}

/** A row of ai_feedback (kind dismiss) as the chat reads it. */
export type DismissRow = { before?: string | null; format?: string | null; post_type?: string | null };

/**
 * What the model reads about rejected ideas: this chat's X taps first, then
 * the team's recent ones (newest first) that are not already listed.
 */
export function rejectedBlock(inChat: string[], team: DismissRow[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (cover: string, tag: string) => {
    const c = cover.replace(/\s+/g, ' ').trim().slice(0, 300);
    const key = c.toLowerCase();
    if (!c || seen.has(key)) return;
    seen.add(key);
    lines.push(`- ${tag}${c}`);
  };
  for (const c of inChat) add(c, '');
  const chatLines = lines.length;
  for (const r of team) if (typeof r.before === 'string') add(r.before, r.format ? `[${r.format}${r.post_type ? `, ${r.post_type}` : ''}] ` : '');
  if (!lines.length) return '';
  const parts: string[] = [];
  if (chatLines) parts.push(`REJECTED IN THIS CHAT (the manager tapped X; never pitch these or anything like them):\n${lines.slice(0, chatLines).join('\n')}`);
  if (lines.length > chatLines) parts.push(`IDEAS THIS TEAM REJECTED (recent X taps; never pitch these or anything like them):\n${lines.slice(chatLines).join('\n')}`);
  return parts.join('\n\n');
}

/** The chat, oldest first, as the model reads it. */
export function transcript(turns: ChatTurn[]): string {
  return turns.map((t) => `${t.role === 'user' ? 'MANAGER' : 'YOU'}: ${t.text.replace(/\n+/g, ' / ')}`).join('\n');
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Valid ideas only: a real format and post type, the cover inside the type's
 * word range, no slop or banned phrases, not a repeat of a taken cover or of
 * another idea. Count sits inside the type's range and matches a number on
 * the cover (a cover number outside the range drops the idea).
 */
export function normalizeChat(
  parsed: ChatRaw,
  opts: {
    taken: string[];
    banned: string[];
    clean: (t: unknown) => string;
    fromModel: (t: unknown) => string;
  },
): ChatOut {
  const { taken, banned, clean, fromModel } = opts;
  const ideas: ChatIdea[] = [];
  for (const d of Array.isArray(parsed.ideas) ? parsed.ideas : []) {
    if (!d || typeof d !== 'object') continue;
    const format: Format | null = d.format === 'reel' ? 'reel' : d.format === 'slideshow' ? 'slideshow' : null;
    if (!format) continue;
    const info = POST_TYPE_LIST[format].find((t) => t.id === d.post_type_id);
    if (!info) continue;
    const noBody = info.id === 'longtext';
    const kind: Kind = d.kind === 'story' && !noBody ? 'story' : 'handheld';
    const spec = specFor(format, info.id);
    const shape = kind === 'story' ? storyShape(format, spec.shape) : spec.shape;
    const cover = dropColons(fromModel(d.cover));
    const [cmin, cmax] = shape.coverText;
    const w = words(cover);
    if (!cover || w < cmin || w > cmax + 2) continue;
    const say = format === 'reel' ? fromModel(d.say).replace(/\n+/g, ' ') : '';
    let count = 0;
    if (!noBody && kind !== 'story') {
      count = clamp(Math.round(Number(d.count)) || spec.count, info.min, info.max);
      const m = cover.match(/^\s*(\d{1,2})\b/);
      if (m) {
        const n = Number(m[1]);
        if (n < info.min || n > info.max) continue;
        count = n;
      }
    }
    const preview = (Array.isArray(d.preview) ? d.preview : [])
      .map((p) => clean(p).replace(/^\s*\d+[.)]\s*/, '').replace(/\s+/g, ' ').slice(0, 80).trim())
      .filter(Boolean)
      .slice(0, 3);
    const all = `${cover} ${say} ${preview.join(' ')}`;
    if (slopHits(all).length) continue;
    if (banned.some((b) => b && all.toLowerCase().includes(b.toLowerCase()))) continue;
    if (taken.some((t) => overlap(t, cover) > 0.75)) continue;
    if (ideas.some((o) => overlap(o.cover, cover) > 0.75)) continue;
    ideas.push({ format, post_type_id: info.id, kind, cover, say, count, angle: clean(d.angle), preview });
    if (ideas.length >= MAX_IDEAS) break;
  }

  const chips: string[] = [];
  for (const c of Array.isArray(parsed.chips) ? parsed.chips : []) {
    const t = clean(c).replace(/[.!]+$/, '');
    if (!t || words(t) > 7 || t.length > 40 || slopHits(t).length) continue;
    if (chips.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    chips.push(t);
    if (chips.length >= 4) break;
  }
  for (const c of DEFAULT_CHIPS) if (chips.length < 2 && !chips.includes(c)) chips.push(c);

  const pitched = Array.isArray(parsed.ideas) && parsed.ideas.length > 0;
  // Every pitch failed the checks (repeats, slop, bad counts): the reply would point at cards that are not there.
  const reply =
    pitched && !ideas.length
      ? 'None of those were good enough to show you. Ask again and I will go a different way.'
      : clean(parsed.reply) || (ideas.length ? 'Here is what I would post.' : 'Tell me a bit more about what you need and I will pitch.');
  return { reply, ideas, chips };
}
