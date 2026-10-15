// Pure helpers for the idea chat screen (app/(admin)/ideas/[campaignId].tsx):
// the message model, what goes over the wire, the chips to show, which slot
// "Make it" fills, each card's state (writing into a slot, in a slot,
// dismissed) and the brief a made card saves. Nothing here touches the
// network or storage.

import { FORMAT_LABEL, kindsFor, postTypesFor, slotLabel } from './brief-copy';
import type { BriefMediaFormat, WeekBriefInput, WeekLanes, WeekSlot } from './briefs-api';
import type { ChatIdea, DeckIdea, IdeaChatTurn, IdeaMakeResult } from './deck-ai';
import { inputFromMake, slidesFromMake } from './library-make';

/** How "Make it" writes a card: every slide, or the hook and CTA for creators to tell their way. */
export type MakeKind = 'handheld' | 'story';

/**
 * A card's state, kept with the chat: writing into a slot, in a slot (with
 * Open and Undo), or dismissed with X. No state is a fresh pitch.
 */
export type IdeaState =
  | { status: 'writing'; slot: number; briefId: string; kind: MakeKind }
  | { status: 'made'; slot: number; briefId: string; kind: MakeKind }
  | { status: 'dismissed' };

export type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      ideas: ChatIdea[];
      chips: string[];
      /** Per idea index. */
      states?: Record<string, IdeaState>;
    }
  /** A failed turn: the server's message and a retry; never sent to the AI. */
  | { id: string; role: 'error'; text: string };

export const START_CHIPS = ['Slideshow idea', 'Reel idea', 'Something contrarian', 'Fill my empty slots'];

/** Messages kept on the device per campaign. */
export const STORED_MESSAGES = 60;

export function newMessageId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The chat as the AI reads it: AI turns carry the covers they pitched, errors are left out. */
export function wireTurns(messages: ChatMessage[]): IdeaChatTurn[] {
  const out: IdeaChatTurn[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', text: m.text });
    else if (m.role === 'assistant') {
      const pitched = m.ideas
        .map((d, i) => `[${d.format} ${d.postTypeId}] "${d.cover}"${m.states?.[String(i)]?.status === 'dismissed' ? ' (rejected)' : ''}`)
        .join('; ');
      out.push({ role: 'assistant', text: pitched ? `${m.text}\nPitched: ${pitched}` : m.text });
    }
  }
  return out;
}

/** Every cover already pitched in this chat. */
export function shownCovers(messages: ChatMessage[]): string[] {
  return messages.flatMap((m) => (m.role === 'assistant' ? m.ideas.map((d) => d.cover) : []));
}

/** Covers the manager tapped X on in this chat. */
export function rejectedCovers(messages: ChatMessage[]): string[] {
  return messages.flatMap((m) => (m.role === 'assistant' ? m.ideas.filter((_, i) => m.states?.[String(i)]?.status === 'dismissed').map((d) => d.cover) : []));
}

export function ideaStateOf(m: ChatMessage, index: number): IdeaState | null {
  return m.role === 'assistant' ? (m.states?.[String(index)] ?? null) : null;
}

/** The chat with one card's state set (null clears it back to a fresh pitch). */
export function withIdeaState(messages: ChatMessage[], messageId: string, index: number, state: IdeaState | null): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId || m.role !== 'assistant') return m;
    const states = { ...(m.states ?? {}) };
    if (state) states[String(index)] = state;
    else delete states[String(index)];
    return { ...m, states };
  });
}

/** Cards left "writing" by a run that is gone (the app was closed) go back to fresh pitches. */
export function dropStaleWriting(messages: ChatMessage[], isRunning: (messageId: string, index: number) => boolean): ChatMessage[] {
  let out = messages;
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.states) continue;
    for (const [k, st] of Object.entries(m.states)) {
      if (st.status === 'writing' && !isRunning(m.id, Number(k))) out = withIdeaState(out, m.id, Number(k), null);
    }
  }
  return out;
}

/** Slots a card is writing into right now, so a second Make it picks another. */
export function writingSlots(messages: ChatMessage[]): string[] {
  return messages.flatMap((m) =>
    m.role === 'assistant' ? Object.values(m.states ?? {}).flatMap((st) => (st.status === 'writing' ? [st.briefId] : [])) : [],
  );
}

/** "Writing into slot 05" / "In slot 05". */
export function ideaStateLabel(state: Extract<IdeaState, { slot: number }>): string {
  return state.status === 'writing' ? `Writing into slot ${slotLabel(state.slot)}` : `In slot ${slotLabel(state.slot)}`;
}

/** The ways Make it can write a card, default first. Long text is one block, so Handheld only. */
export function makeKindsFor(idea: ChatIdea): { kind: MakeKind; name: string; line: string }[] {
  const copy = kindsFor(idea.format);
  const all: MakeKind[] = idea.postTypeId === 'longtext' ? ['handheld'] : ['handheld', 'story'];
  return all.map((k) => ({
    kind: k,
    name: copy[k].name,
    line: k === 'handheld' ? 'We write every slide.' : 'We write the hook and CTA. The creator tells it their way.',
  }));
}

/** The kind highlighted when the sheet opens: the card's own, Handheld unless it is a Story idea. */
export function defaultMakeKind(idea: ChatIdea): MakeKind {
  return idea.kind === 'story' && idea.postTypeId !== 'longtext' ? 'story' : 'handheld';
}

/**
 * The save input for a made card. Handheld is the whole deck, as the Library
 * saves it. Story is the cover and CTA only, with the cover as its theme.
 */
export function inputFromIdeaMake(made: IdeaMakeResult, postTypeId: string | null): WeekBriefInput {
  const base = inputFromMake({ ...made, kind: 'handheld' }, postTypeId);
  if (made.kind !== 'story') return base;
  const slides = slidesFromMake(made).filter((s) => s.role === 'cover' || s.role === 'cta');
  const cta = slides.find((s) => s.role === 'cta');
  // The editor's defaults: a numbered tips Story locks one count, others a 4 to 8 range.
  const range = made.postTypeId === 'tips' ? { min: 4, max: 4 } : { min: 4, max: 8 };
  return {
    ...base,
    kind: 'story',
    slides,
    story: { theme: made.cover, beats: [], ...range, ctaAt: cta?.place ?? 'any' },
    cta: { text: cta?.text ?? '', featureId: cta?.inset_feature_id ?? null },
  };
}

/** Chips above the input: the last AI turn's follow ups, else the starters. */
export function currentChips(messages: ChatMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant') return m.chips.length ? m.chips : START_CHIPS;
  }
  return START_CHIPS;
}

export function moreLikeText(idea: ChatIdea): string {
  return `More like: ${idea.cover}`;
}

export type SlotTarget = { ok: true; slot: WeekSlot } | { ok: false; message: string };

/**
 * The slot "Make it" fills: the empty slot the chat was opened from when the
 * idea is its format, else the first empty slot of the idea's format.
 */
export function pickTargetSlot(
  lanes: WeekLanes,
  format: BriefMediaFormat,
  preferredBriefId?: string | null,
  /** Slots another card is writing into right now. */
  busy: string[] = [],
): SlotTarget {
  const lane = lanes[format].filter((s) => s.brief === null && !busy.includes(s.briefId));
  const preferred = preferredBriefId ? lane.find((s) => s.briefId === preferredBriefId) : undefined;
  const slot = preferred ?? lane[0];
  if (slot) return { ok: true, slot };
  return { ok: false, message: `No empty ${FORMAT_LABEL[format].toLowerCase()} slots left this week. Clear one on the week first.` };
}

/** "2 slideshows and 1 reel open", for the header. */
export function openSlotsLabel(lanes: WeekLanes): string {
  const n = (f: BriefMediaFormat) => lanes[f].filter((s) => s.brief === null).length;
  const part = (count: number, one: string) => (count ? `${count} ${one}${count === 1 ? '' : 's'}` : '');
  const parts = [part(n('slideshow'), 'slideshow'), part(n('reel'), 'reel')].filter(Boolean);
  return parts.length ? `${parts.join(' and ')} open` : 'Every slot is filled';
}

export function ideaPostTypeKey(idea: ChatIdea): string | undefined {
  return postTypesFor(idea.format).find((t) => t.id === idea.postTypeId)?.key;
}

export function ideaPostTypeName(idea: ChatIdea): string {
  return postTypesFor(idea.format).find((t) => t.id === idea.postTypeId)?.name ?? '';
}

export type IdeaParams = { ideaCover?: string; ideaSay?: string; ideaCount?: string; ideaAngle?: string };

/** The idea as editor route params. */
export function ideaEditorParams(idea: ChatIdea): Required<IdeaParams> {
  return { ideaCover: idea.cover, ideaSay: idea.say, ideaCount: String(idea.count), ideaAngle: idea.angle };
}

/** Back from route params; null without a cover. */
export function parseIdeaParams(p: IdeaParams): DeckIdea | null {
  const cover = typeof p.ideaCover === 'string' ? p.ideaCover.trim() : '';
  if (!cover) return null;
  const n = Number(p.ideaCount);
  return {
    cover,
    say: typeof p.ideaSay === 'string' ? p.ideaSay : '',
    count: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
    angle: typeof p.ideaAngle === 'string' ? p.ideaAngle : '',
  };
}

function isIdea(v: unknown): v is ChatIdea {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    (d.format === 'slideshow' || d.format === 'reel') &&
    typeof d.postTypeId === 'string' &&
    (d.kind === 'handheld' || d.kind === 'story') &&
    typeof d.cover === 'string' &&
    typeof d.say === 'string' &&
    typeof d.count === 'number' &&
    typeof d.angle === 'string' &&
    Array.isArray(d.preview)
  );
}

/** Stored chat back from JSON; anything malformed is dropped, never thrown. */
export function parseStoredChat(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: ChatMessage[] = [];
  for (const v of data) {
    if (!v || typeof v !== 'object') continue;
    const m = v as Record<string, unknown>;
    if (typeof m.id !== 'string' || typeof m.text !== 'string') continue;
    if (m.role === 'user' || m.role === 'error') out.push({ id: m.id, role: m.role, text: m.text });
    else if (m.role === 'assistant') {
      // Ideas are kept in place (never filtered out) so state indexes stay true.
      const ideas = Array.isArray(m.ideas) ? m.ideas : [];
      const states = parseStates(m.states);
      out.push({
        id: m.id,
        role: 'assistant',
        text: m.text,
        ideas: ideas.filter(isIdea),
        chips: Array.isArray(m.chips) ? m.chips.filter((c): c is string => typeof c === 'string') : [],
        ...(ideas.every(isIdea) && states ? { states } : {}),
      });
    }
  }
  return out;
}

function parseStates(v: unknown): Record<string, IdeaState> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, IdeaState> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d+$/.test(k) || !raw || typeof raw !== 'object') continue;
    const st = raw as Record<string, unknown>;
    if (st.status === 'dismissed') out[k] = { status: 'dismissed' };
    else if (
      (st.status === 'writing' || st.status === 'made') &&
      typeof st.slot === 'number' &&
      typeof st.briefId === 'string' &&
      (st.kind === 'handheld' || st.kind === 'story')
    ) {
      out[k] = { status: st.status, slot: st.slot, briefId: st.briefId, kind: st.kind };
    }
  }
  return Object.keys(out).length ? out : null;
}
