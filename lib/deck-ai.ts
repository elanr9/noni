// Client for the write-deck edge function: the AI behind the stepped brief
// editor. Ideas for the cover, writing slides, the CTA and details, revise,
// and a strict review of the finished post all go through here, so
// slideshows and reels get one voice, exact slide counts and a real CTA. The
// idea chat (ideaChat) runs through it too.

import { isCtaPlacement, type BriefKind, type BriefMediaFormat, type BriefSlide, type CtaPlacement } from './briefs-api';
import { postTypesFor, type PostTypeCopy } from './brief-copy';
import { supabase } from './supabase';

export type DeckMode = 'ideas' | 'cover' | 'points' | 'cta' | 'details' | 'revise' | 'all' | 'review';

export type DeckSlideOut = { text: string; shot: string; featureId: string | null; changed: boolean };

export type DeckResult = {
  slides: DeckSlideOut[];
  caption: string | null;
  hashtags: string[] | null;
  searchPhrase: string | null;
  note: string | null;
  warnings: string[];
};

function postTypeBody(postType: PostTypeCopy | null) {
  return postType ? { id: postType.id, key: postType.key, name: postType.name, about: postType.about, example: postType.example } : null;
}

function slidesBody(slides: BriefSlide[]) {
  return slides.map((s) => ({ role: s.role, text: s.text, shot: s.shot, inset_feature_id: s.inset_feature_id, ...(s.role === 'cta' && s.place ? { place: s.place } : {}) }));
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('write-deck', { body });
  if (error) {
    // Non 2xx: the function's own { error } is in the response body.
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    const b = typeof ctx?.json === 'function' ? ((await ctx.json().catch(() => null)) as { error?: unknown; message?: unknown; code?: unknown } | null) : null;
    const status = (ctx as { status?: number } | undefined)?.status;
    // The gateway answers 404 NOT_FOUND when write-deck is not deployed yet.
    if (status === 404 || b?.code === 'NOT_FOUND') throw new Error('AI is not set up on the server yet. Deploy the write-deck function.');
    const msg = typeof b?.error === 'string' ? b.error : typeof b?.message === 'string' ? b.message : null;
    throw new Error(msg ?? (status ? `AI request failed (${status}). Try again.` : 'AI request failed. Try again.'));
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  if (typeof raw.error === 'string') throw new Error(raw.error);
  return raw;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Write part of the deck. Comes back the same length and order it went in. */
export async function writeDeck(params: {
  briefId?: string;
  mode: Exclude<DeckMode, 'ideas' | 'review'>;
  format: BriefMediaFormat;
  kind: Exclude<BriefKind, 'open'>;
  postType: PostTypeCopy | null;
  slides: BriefSlide[];
  caption?: string;
  hashtags?: string[];
  searchPhrase?: string;
  featureId?: string | null;
  feedback?: string;
}): Promise<DeckResult> {
  const raw = await call({
    brief_id: params.briefId,
    mode: params.mode,
    format: params.format,
    kind: params.kind,
    post_type: postTypeBody(params.postType),
    slides: slidesBody(params.slides),
    caption: params.caption,
    hashtags: params.hashtags,
    search_phrase: params.searchPhrase,
    feature_id: params.featureId ?? null,
    feedback: params.feedback,
  });
  const slides = Array.isArray(raw.slides) ? (raw.slides as Record<string, unknown>[]) : [];
  return {
    slides: slides.map((s) => ({ text: str(s.text), shot: str(s.shot), featureId: typeof s.feature_id === 'string' ? s.feature_id : null, changed: s.changed === true })),
    caption: str(raw.caption) || null,
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.filter((h): h is string => typeof h === 'string') : null,
    searchPhrase: str(raw.search_phrase) || null,
    note: str(raw.note) || null,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
  };
}

export type DeckIdea = {
  /** Cover text: the slideshow hook, or the reel title card. */
  cover: string;
  /** Reels: the first line the creator says. Empty for slideshows. */
  say: string;
  /** Body slides including the CTA; 0 for Story and Long text. */
  count: number;
  /** Why it earns saves, one line to the manager. */
  angle: string;
};

/** Six covers for this post type that do not repeat the week, recent posts or exclude. */
export async function deckIdeas(params: {
  briefId?: string;
  format: BriefMediaFormat;
  kind: Exclude<BriefKind, 'open'>;
  postType: PostTypeCopy | null;
  /** Covers already shown, so Different ideas means different. */
  exclude?: string[];
}): Promise<DeckIdea[]> {
  const raw = await call({
    brief_id: params.briefId,
    mode: 'ideas',
    format: params.format,
    kind: params.kind,
    post_type: postTypeBody(params.postType),
    slides: [],
    exclude: params.exclude?.length ? params.exclude : undefined,
  });
  const ideas = Array.isArray(raw.ideas) ? (raw.ideas as Record<string, unknown>[]) : [];
  return ideas
    .map((d) => ({ cover: str(d.cover), say: str(d.say), count: typeof d.count === 'number' ? d.count : 0, angle: str(d.angle) }))
    .filter((d) => d.cover.trim());
}

export type DeckFix = { i: number; problem: string; text: string; shot: string };

export type DeckReview = {
  score: number;
  verdict: string;
  fixes: DeckFix[];
  /** Hard rule hits found without the model (slop words, missing product name). */
  flags: string[];
};

/** A strict second read of the finished post, with ready to apply fixes. */
export async function reviewDeck(params: {
  briefId?: string;
  format: BriefMediaFormat;
  kind: Exclude<BriefKind, 'open'>;
  postType: PostTypeCopy | null;
  slides: BriefSlide[];
  caption: string;
  hashtags: string[];
  searchPhrase: string;
}): Promise<DeckReview> {
  const raw = await call({
    brief_id: params.briefId,
    mode: 'review',
    format: params.format,
    kind: params.kind,
    post_type: postTypeBody(params.postType),
    slides: slidesBody(params.slides),
    caption: params.caption,
    hashtags: params.hashtags,
    search_phrase: params.searchPhrase,
  });
  const fixes = Array.isArray(raw.fixes) ? (raw.fixes as Record<string, unknown>[]) : [];
  return {
    score: typeof raw.score === 'number' ? raw.score : 0,
    verdict: str(raw.verdict),
    fixes: fixes.filter((f) => typeof f.i === 'number' && str(f.text)).map((f) => ({ i: f.i as number, problem: str(f.problem), text: str(f.text), shot: str(f.shot) })),
    flags: Array.isArray(raw.flags) ? raw.flags.filter((f): f is string => typeof f === 'string') : [],
  };
}

/** A slide on the creator side: the manager's are locked, the creator's are own. */
export type CreatorDeckSlide = BriefSlide & { own: boolean };

/**
 * Creator asks: write only the creator's own slides (by deck index) or the
 * details, or pitch covers for their post. The manager's slides ride along as
 * fixed context.
 */
export async function creatorDeck(params: {
  briefId: string;
  mode: 'ideas' | 'all' | 'details';
  format: BriefMediaFormat;
  kind: BriefKind;
  postType: PostTypeCopy | null;
  slides: CreatorDeckSlide[];
  only?: number[];
  caption?: string;
  hashtags?: string[];
  searchPhrase?: string;
}): Promise<{ ideas: DeckIdea[]; result: DeckResult | null }> {
  const raw = await call({
    brief_id: params.briefId,
    mode: params.mode,
    format: params.format,
    kind: params.kind,
    post_type: postTypeBody(params.postType),
    slides: params.slides.map((s) => ({ role: s.role, text: s.text, shot: s.shot, inset_feature_id: s.inset_feature_id, own: s.own })),
    only: params.only,
    caption: params.caption,
    hashtags: params.hashtags,
    search_phrase: params.searchPhrase,
  });
  if (params.mode === 'ideas') {
    const ideas = Array.isArray(raw.ideas) ? (raw.ideas as Record<string, unknown>[]) : [];
    return { ideas: ideas.map((d) => ({ cover: str(d.cover), say: str(d.say), count: typeof d.count === 'number' ? d.count : 0, angle: str(d.angle) })).filter((d) => d.cover.trim()), result: null };
  }
  const slides = Array.isArray(raw.slides) ? (raw.slides as Record<string, unknown>[]) : [];
  return {
    ideas: [],
    result: {
      slides: slides.map((s) => ({ text: str(s.text), shot: str(s.shot), featureId: typeof s.feature_id === 'string' ? s.feature_id : null, changed: s.changed === true })),
      caption: str(raw.caption) || null,
      hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.filter((h): h is string => typeof h === 'string') : null,
      searchPhrase: str(raw.search_phrase) || null,
      note: str(raw.note) || null,
      warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
    },
  };
}

export type ChatIdea = {
  format: BriefMediaFormat;
  /** Post type id from lib/brief-copy for that format (howto, tips, talking...). */
  postTypeId: string;
  kind: Exclude<BriefKind, 'open'>;
  cover: string;
  /** Reels: the spoken hook. Empty for slideshows. */
  say: string;
  /** Body slides including the CTA; 0 for Story and Long text. */
  count: number;
  /** Why it earns saves or sends, one line to the manager. */
  angle: string;
  /** The first slide headers or beats, short. */
  preview: string[];
};

export type IdeaChatTurn = { role: 'user' | 'assistant'; text: string };

export type IdeaChatResult = { reply: string; ideas: ChatIdea[]; chips: string[] };

/**
 * One turn of the idea chat: the AI answers the last manager message with a
 * short reply, up to four ideas that fit real post types and empty slots, and
 * follow up chips.
 */
export async function ideaChat(params: {
  campaignId: string;
  messages: IdeaChatTurn[];
  /** The format of the empty slot the chat was opened from. */
  formatHint?: BriefMediaFormat | null;
  /** Covers already pitched in this chat, so they never come back. */
  shown?: string[];
}): Promise<IdeaChatResult> {
  // Never leave the manager watching dots: give up after 45s with a retry.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The AI took too long. Tap retry.')), 45000);
  });
  const raw = await Promise.race([timeout, call({
    mode: 'chat',
    campaign_id: params.campaignId,
    messages: params.messages.slice(-16),
    format_hint: params.formatHint ?? null,
    shown: params.shown?.length ? params.shown.slice(-40) : undefined,
  })]).finally(() => clearTimeout(timer));
  const ideas = Array.isArray(raw.ideas) ? (raw.ideas as Record<string, unknown>[]) : [];
  return {
    reply: str(raw.reply),
    ideas: ideas
      .map((d): ChatIdea | null => {
        const format: BriefMediaFormat | null = d.format === 'reel' ? 'reel' : d.format === 'slideshow' ? 'slideshow' : null;
        const postTypeId = str(d.post_type_id);
        if (!format || !postTypesFor(format).some((t) => t.id === postTypeId) || !str(d.cover).trim()) return null;
        return {
          format,
          postTypeId,
          kind: d.kind === 'story' ? 'story' : 'handheld',
          cover: str(d.cover),
          say: str(d.say),
          count: typeof d.count === 'number' && Number.isFinite(d.count) ? d.count : 0,
          angle: str(d.angle),
          preview: Array.isArray(d.preview) ? d.preview.filter((p): p is string => typeof p === 'string' && Boolean(p.trim())).slice(0, 3) : [],
        };
      })
      .filter((d): d is ChatIdea => d !== null),
    chips: Array.isArray(raw.chips) ? raw.chips.filter((c): c is string => typeof c === 'string' && Boolean(c.trim())).slice(0, 4) : [],
  };
}

export type MakeSlide = {
  role: 'cover' | 'point' | 'cta';
  text: string;
  shot: string;
  featureId: string | null;
  place: CtaPlacement | null;
};

export type MakeResult = {
  format: BriefMediaFormat;
  /** Post type id from lib/brief-copy for that format (howto, tips, talking...). */
  postTypeId: string;
  kind: 'handheld';
  cover: string;
  /** Reels: the spoken hook (the cover's shot). Empty for slideshows. */
  say: string;
  slides: MakeSlide[];
  caption: string;
  hashtags: string[];
  searchPhrase: string;
  /** References: one line on what structure was kept. */
  sourceNote: string;
  warnings: string[];
};

/** Pure: the make answer as the app uses it, or null when it is not a post. */
export function parseMakeResult(raw: Record<string, unknown>): MakeResult | null {
  const format: BriefMediaFormat | null = raw.format === 'reel' ? 'reel' : raw.format === 'slideshow' ? 'slideshow' : null;
  const postTypeId = str(raw.post_type_id);
  if (!format || !postTypesFor(format).some((t) => t.id === postTypeId)) return null;
  const slides: MakeSlide[] = (Array.isArray(raw.slides) ? (raw.slides as Record<string, unknown>[]) : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      role: s.role === 'cover' || s.role === 'cta' ? s.role : 'point',
      text: str(s.text),
      shot: str(s.shot),
      featureId: typeof s.feature_id === 'string' ? s.feature_id : null,
      place: isCtaPlacement(s.place) ? s.place : null,
    }));
  if (slides.length < 2 || slides[0].role !== 'cover' || !slides.some((s) => s.role === 'cta')) return null;
  return {
    format,
    postTypeId,
    kind: 'handheld',
    cover: str(raw.cover) || slides[0].text,
    say: str(raw.say),
    slides,
    caption: str(raw.caption),
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.filter((h): h is string => typeof h === 'string') : [],
    searchPhrase: str(raw.search_phrase),
    sourceNote: str(raw.source_note),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
  };
}

/**
 * The Library's make: the best post for a typed idea, or our remix of a
 * reference post (its study must be done; see lib/library-make). One call
 * writes the whole deck in the new slides format.
 */
export async function makePost(params: {
  idea?: string;
  /** reference_studies id of the pasted post. */
  referenceId?: string;
  direction?: string;
  /** null: the AI picks. Ignored for a reference, which keeps its own format. */
  format?: BriefMediaFormat | null;
  /** Post type id from lib/brief-copy, or null for the AI to pick. */
  postTypeId?: string | null;
  /** Covers already written for this input, so Redo is a fresh take. */
  avoid?: string[];
}): Promise<MakeResult> {
  const raw = await call({
    mode: 'make',
    idea: params.idea || undefined,
    reference_id: params.referenceId || undefined,
    direction: params.direction?.trim() || undefined,
    format: params.format ?? null,
    post_type: params.postTypeId ?? null,
    avoid: params.avoid?.length ? params.avoid : undefined,
  });
  const out = parseMakeResult(raw);
  if (!out) throw new Error('The AI did not write a usable post. Try again.');
  return out;
}

/** Pure: the chat answer's ideas as the app uses them; unknown types and empty covers drop. */
export function parseChatIdeas(raw: unknown): ChatIdea[] {
  const ideas = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return ideas
    .map((d): ChatIdea | null => {
      if (!d || typeof d !== 'object') return null;
      const format: BriefMediaFormat | null = d.format === 'reel' ? 'reel' : d.format === 'slideshow' ? 'slideshow' : null;
      const postTypeId = str(d.post_type_id);
      if (!format || !postTypesFor(format).some((t) => t.id === postTypeId) || !str(d.cover).trim()) return null;
      return {
        format,
        postTypeId,
        kind: d.kind === 'story' ? 'story' : 'handheld',
        cover: str(d.cover),
        say: str(d.say),
        count: typeof d.count === 'number' && Number.isFinite(d.count) ? d.count : 0,
        angle: str(d.angle),
        preview: Array.isArray(d.preview) ? d.preview.filter((p): p is string => typeof p === 'string' && Boolean(p.trim())).slice(0, 3) : [],
      };
    })
    .filter((d): d is ChatIdea => d !== null);
}

/**
 * One idea chat turn that also learns from X taps: rejected covers go to the
 * server, which never pitches them or anything like them again.
 */
export async function ideaChatTurn(params: {
  campaignId: string;
  messages: IdeaChatTurn[];
  formatHint?: BriefMediaFormat | null;
  shown?: string[];
  /** Covers the manager tapped X on in this chat. */
  rejected?: string[];
}): Promise<IdeaChatResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The AI took too long. Tap retry.')), 45000);
  });
  const raw = await Promise.race([
    timeout,
    call({
      mode: 'chat',
      campaign_id: params.campaignId,
      messages: params.messages.slice(-16),
      format_hint: params.formatHint ?? null,
      shown: params.shown?.length ? params.shown.slice(-40) : undefined,
      rejected: params.rejected?.length ? params.rejected.slice(-30) : undefined,
    }),
  ]).finally(() => clearTimeout(timer));
  return {
    reply: str(raw.reply),
    ideas: parseChatIdeas(raw.ideas),
    chips: Array.isArray(raw.chips) ? raw.chips.filter((c): c is string => typeof c === 'string' && Boolean(c.trim())).slice(0, 4) : [],
  };
}

/** A post made from an idea chat card: Handheld (every slide) or Story (cover and CTA). */
export type IdeaMakeResult = Omit<MakeResult, 'kind'> & { kind: 'handheld' | 'story' };

/**
 * "Make it" on an idea chat card: write-deck make with the card pinned (its
 * cover, hook, post type, format and outline), so the post is that idea.
 * Story and Long text come back as the cover and the CTA only.
 */
export async function makeFromIdea(idea: ChatIdea, kind: 'handheld' | 'story'): Promise<IdeaMakeResult> {
  // Long text is one block; it is never a Story.
  const k = idea.postTypeId === 'longtext' ? 'handheld' : kind;
  const raw = await call({
    mode: 'make',
    format: idea.format,
    post_type: idea.postTypeId,
    kind: k,
    cover: idea.cover,
    say: idea.say,
    outline: idea.preview,
    angle: idea.angle,
    count: k === 'handheld' ? idea.count : 0,
  });
  const out = parseMakeResult(raw);
  if (!out) throw new Error('The AI did not write a usable post. Try again.');
  return { ...out, kind: raw.kind === 'story' && k === 'story' ? 'story' : 'handheld' };
}
