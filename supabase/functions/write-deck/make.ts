// write-deck make mode: the Library's "write me the best post" for a typed
// idea or a pasted reference. Prompt pieces and the pure clean up of the
// model's deck; index.ts does the I/O and runs the same checks and targeted
// repair as every other write. Nothing here touches the network, so
// make_test.ts runs it as is.

import { dropColons, type CtaPlace, type InSlide, type OutSlide } from './checks.ts';
import { POST_TYPE_LIST, specFor, storyNote, type Format, type Kind, type TypeInfo } from './specs.ts';

/** What the Library sends. */
export type MakeIn = {
  idea?: unknown;
  reference_id?: unknown;
  url?: unknown;
  direction?: unknown;
  /** null or missing: the model picks. A reference always keeps its own format. */
  format?: unknown;
  /** A post type id from POST_TYPE_LIST (howto, tips...), or null for the model to pick. */
  post_type?: unknown;
};

/** The reference as the writer reads it: the stored study. */
export type MakeSource = {
  url: string;
  format: Format;
  platform: string | null;
  caption: string | null;
  transcript: string | null;
  slideTexts: string[];
  /** patternLines of the study's pattern card, CTA included. */
  pattern: string | null;
};

export type MakeRaw = {
  format?: unknown;
  post_type_id?: unknown;
  numbered?: unknown;
  slides?: { role?: unknown; text?: unknown; shot?: unknown; feature_id?: unknown }[];
  caption?: unknown;
  hashtags?: unknown;
  search_phrase?: unknown;
  source_note?: unknown;
};

export type Made = {
  format: Format;
  typeId: string;
  typeName: string;
  numbered: boolean;
  /** The blank deck: roles and the CTA's place, nothing written. */
  skeleton: InSlide[];
  /** What the model wrote, one per skeleton slide. */
  out: OutSlide[];
  sourceNote: string;
};

/** Handheld types make can write: every type with body slides (Long text is out of scope). */
export function makeTypes(format: Format): TypeInfo[] {
  return POST_TYPE_LIST[format].filter((t) => t.id !== 'longtext');
}

/** Body slides (CTA included) a made post may have: the type's range, or the source's own count for a remix. */
export function bodyRange(format: Format, typeId: string, remix: boolean): [number, number] {
  const info = makeTypes(format).find((t) => t.id === typeId);
  if (remix) return [2, 12];
  return info ? [info.min, info.max] : [3, 8];
}

/**
 * Where the CTA sits. A remix keeps the source's spot: right after the hook,
 * last, or among the items (where each creator may move it). A typed idea
 * lets every creator place it.
 */
export function ctaPlaceFor(ctaAt: number, bodyCount: number, remix: boolean): CtaPlace {
  if (!remix || bodyCount < 3) return 'any';
  if (ctaAt === 1) return 'after_hook';
  if (ctaAt === bodyCount) return 'end';
  return 'any';
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * The model's deck made valid: a known format and handheld post type, the
 * cover first, exactly one CTA, the body inside its range (extra points drop
 * from the end, never the CTA). Throws when there is nothing usable.
 */
export function normalizeMade(
  raw: MakeRaw,
  opts: {
    /** Pinned by the reference or the manager; the model's pick is ignored then. */
    format: Format | null;
    typeId: string | null;
    remix: boolean;
    known: Set<string>;
    fromModel: (t: unknown) => string;
    clean: (t: unknown) => string;
    /** An idea chat card: its cover (and reel hook) are kept word for word, its count is the body length. */
    pinned?: MakeIdea | null;
  },
): Made {
  const format: Format = opts.format ?? (raw.format === 'reel' ? 'reel' : 'slideshow');
  const types = makeTypes(format);
  const wanted = opts.typeId ?? str(raw.post_type_id);
  const info = types.find((t) => t.id === wanted) ?? types.find((t) => t.id === (format === 'reel' ? 'talking' : 'tips'))!;
  const spec = specFor(format, info.id);

  type Row = { role: 'cover' | 'point' | 'cta'; text: string; shot: string; feature: string | null };
  const rows: Row[] = (Array.isArray(raw.slides) ? raw.slides : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      role: s.role === 'cover' ? 'cover' : s.role === 'cta' ? 'cta' : 'point',
      text: opts.fromModel(s.text),
      shot: opts.fromModel(s.shot),
      feature: typeof s.feature_id === 'string' && opts.known.has(s.feature_id) ? s.feature_id : null,
    }));
  if (!rows.length || !rows.some((r) => r.text.trim())) throw new Error('The AI wrote nothing usable. Try again.');

  // The first slide is the cover, whatever the model called it.
  const [first, ...rest] = rows;
  const pin = opts.pinned ?? null;
  const cover: Row = {
    ...first,
    role: 'cover',
    text: pin?.cover ? pin.cover : dropColons(first.text),
    shot: pin?.say && format === 'reel' ? pin.say : first.shot,
    feature: null,
  };
  let body: Row[] = rest.map((r) => (r.role === 'cover' ? { ...r, role: 'point' } : r));
  // Exactly one CTA: the first one the model wrote, else the last slide.
  const firstCta = body.findIndex((r) => r.role === 'cta');
  body = body.map((r, i) => (r.role === 'cta' && i !== firstCta ? { ...r, role: 'point', feature: null } : r));
  if (firstCta < 0 && body.length) body[body.length - 1] = { ...body[body.length - 1], role: 'cta' };
  body = body.map((r) => (r.role === 'cta' ? r : { ...r, feature: null }));

  const [min, range] = bodyRange(format, info.id, opts.remix);
  // A pinned card's count is the body length when it fits the type.
  const max = pin && pin.count >= min && pin.count <= range ? pin.count : range;
  while (body.length > max) {
    const drop = body.map((r) => r.role).lastIndexOf('point');
    if (drop < 0) break;
    body.splice(drop, 1);
  }
  if (body.length < Math.min(min, 2)) throw new Error('The AI wrote too few slides. Try again.');

  const ctaAt = body.findIndex((r) => r.role === 'cta') + 1;
  const place = ctaPlaceFor(ctaAt, body.length, opts.remix);
  const deck = [cover, ...body];
  const skeleton: InSlide[] = deck.map((r) => ({
    role: r.role,
    text: '',
    shot: '',
    inset_feature_id: null,
    ...(r.role === 'cta' ? { place } : {}),
  }));
  const out: OutSlide[] = deck.map((r) => ({ text: r.text, shot: r.shot, feature_id: r.feature, changed: true }));
  // A remix keeps the source's own list shape; a typed idea follows the type.
  const numbered = opts.remix && typeof raw.numbered === 'boolean' ? raw.numbered : spec.numbered;
  return { format, typeId: info.id, typeName: info.name, numbered, skeleton, out, sourceNote: opts.clean(raw.source_note) };
}

/** The post types the model may pick from, with their range and rules. */
export function makeTypesBlock(formats: Format[], pinnedType: string | null): string {
  const lines: string[] = [
    pinnedType
      ? 'POST TYPE (the manager picked it; post_type_id is the id in brackets):'
      : 'POST TYPES (pick the ONE that fits best; post_type_id is the id in brackets):',
  ];
  for (const format of formats) {
    lines.push(format === 'slideshow' ? 'SLIDESHOWS:' : 'REELS:');
    for (const t of makeTypes(format)) {
      if (pinnedType && t.id !== pinnedType) continue;
      const spec = specFor(format, t.id);
      lines.push(
        `- [${t.id}] ${t.name} (${t.min} to ${t.max} body slides, CTA included${spec.numbered ? ', numbered' : ''}). ${spec.what} COVER: ${spec.cover} BODY: ${spec.body} SLIDE SHAPE: ${spec.slideShape} CTA: ${spec.cta} WHAT KILLS IT: ${spec.kills}`,
      );
    }
  }
  return lines.join('\n');
}

/** The reference, as close to its real words as the study keeps them. */
export function sourceBlock(src: MakeSource): string {
  const slides = src.slideTexts.filter((t) => t.trim());
  return [
    `THE REFERENCE POST (a ${src.format === 'slideshow' ? 'photo slideshow' : 'video'}${src.platform ? ` on ${src.platform}` : ''}). This is the post to remix. Study its craft; never copy its sentences.`,
    slides.length
      ? `Its slides, word for word (${slides.length} read; the first is its cover):\n${slides.map((t, i) => `[${i + 1}] ${t.replace(/\s*\n\s*/g, ' / ')}`).join('\n')}`
      : '',
    src.transcript?.trim() ? `What is said, word for word:\n${src.transcript.trim().slice(0, 3500)}` : '',
    src.caption?.trim() ? `Its caption: ${src.caption.trim().slice(0, 500)}` : '',
    src.pattern ? `Its breakdown:\n${src.pattern}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function remixRules(productName: string, format: Format, direction: string): string {
  const unit = format === 'slideshow' ? 'slide' : 'point';
  return [
    'REMIX RULES (they win over any post type rule above where the two disagree):',
    `- Keep the format (${format}). Keep the structure beat for beat: the same number of body ${unit}s as the source has items (the CTA counts as one of them only when the source's ask sits among its items; otherwise add it where the source asks), the same list shape (numbered or not, question list, steps, myth then truth), the same pacing and ${unit} text length, and the CTA in the same spot and the same style the source uses.`,
    "- Keep the source's cover or hook template word for word and swap only the topic. Example: \"Questions to ask during your sorority interview\" with the direction \"first call with a college coach\" becomes \"Questions to ask on your first call with a college coach\". Fix the grammar where the swap needs it.",
    direction
      ? `- THE DIRECTION from the manager sets the topic: ${direction}. Every ${unit} is about that.`
      : "- No direction was given: keep the source's topic angle, translated to this audience and this product's world.",
    "- Never copy the source's sentences anywhere else. Every fact, number, name and scenario comes from the brand docs and this niche, never from the source's niche.",
    `- The CTA names ${productName} and one real feature from the Features list by what it does, in the source's CTA style.`,
    `- numbered is true when the source numbers its items.`,
    `- source_note is one plain line to the manager naming what you kept from the source (for example "Kept the 6 question list, the cover template and the CTA as the last slide").`,
  ].join('\n');
}

export function ideaRules(productName: string, idea: string, direction: string, pickFormat: boolean, pickType: boolean): string {
  return [
    `THE IDEA from the manager: ${idea}`,
    direction ? `Their extra direction: ${direction}` : '',
    'Treat the idea as the topic and the intent, never as a phrase to copy. Write the best possible post on it for this audience: the cleanest cover a player would stop on, a hook that earns the swipe, specific slides, and a CTA that plugs one real feature.',
    pickFormat ? 'Pick the format that serves this idea best: slideshow for lists, steps and references people save; reel for advice that lands better said to camera or a story.' : '',
    pickType ? 'Pick the post type closest to the idea.' : '',
    `The CTA names ${productName} and one real feature from the Features list by what it does.`,
    'numbered follows the post type. source_note is an empty string.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function makeAnswer(format: Format | null): string {
  const reel = format === 'reel' ? true : format === 'slideshow' ? false : null;
  return [
    'ANSWER with one JSON object and nothing else: {"format": "slideshow" | "reel", "post_type_id": string, "numbered": boolean, "slides": [{"role": "cover" | "point" | "cta", "text": string, "shot": string, "feature_id": string | null}], "caption": string, "hashtags": string[], "search_phrase": string, "source_note": string}.',
    'slides is the whole post in order: the cover first, then every body slide with exactly one cta among them. feature_id is set on the cta only, copied from the Features list.',
    reel === false
      ? 'shot on every slide is the photo the creator takes for it.'
      : reel === true
        ? 'For reels the cover text is the title card and the cover shot is the first line the creator says (the spoken hook); every point text is the on screen label and its shot is the cue the creator says.'
        : 'For a slideshow shot is the photo the creator takes for each slide. For a reel the cover text is the title card, the cover shot is the spoken hook, and each point shot is the cue the creator says.',
    'Put a line break inside text as " / ". Fill caption, hashtags and search_phrase.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The idea chat's "Make it": the card is the post. Its cover, hook, post type,
// format and outline are pinned; make writes that post, never a new topic.

/** The idea chat card as make reads it. */
export type MakeIdea = { cover: string; say: string; outline: string[]; angle: string; count: number };

/** The card fields of a make request, or null when the request is not from a card. */
export function readMakeIdea(
  body: { cover?: unknown; say?: unknown; outline?: unknown; angle?: unknown; count?: unknown },
  clean: (t: unknown) => string,
): MakeIdea | null {
  const cover = clean(body.cover).slice(0, 900);
  if (!cover) return null;
  const n = Math.round(Number(body.count));
  return {
    cover,
    say: clean(body.say).replace(/\n+/g, ' ').slice(0, 300),
    outline: (Array.isArray(body.outline) ? body.outline : []).map((t) => clean(t).slice(0, 120)).filter(Boolean).slice(0, 8),
    angle: clean(body.angle).slice(0, 300),
    count: Number.isFinite(n) && n > 0 ? n : 0,
  };
}

/** Story (any type) and Long text are cover and CTA only: the short make. */
export function isShortMake(kind: unknown, format: Format, typeId: string | null): boolean {
  return kind === 'story' || (format === 'reel' && typeId === 'longtext');
}

const SHORT_RULE = 'Keep every line short: one thought per slide, the fewest words that still carry the detail.';

/** The rules for writing a card the manager already approved. */
export function pinnedIdeaRules(productName: string, idea: MakeIdea, format: Format): string {
  return [
    `THE POST the manager picked (write exactly this post; never change its topic or angle):`,
    `Cover, kept word for word: ${idea.cover.replace(/\n+/g, ' / ')}`,
    format === 'reel' && idea.say ? `Spoken hook, kept word for word as the cover shot: ${idea.say}` : '',
    idea.outline.length ? `Its outline, the first beats in order (build on them, sharpen the wording):\n${idea.outline.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : '',
    idea.angle ? `Why it works: ${idea.angle}` : '',
    idea.count ? `The body has exactly ${idea.count} ${format === 'reel' ? 'points' : 'slides'} including the CTA.` : '',
    'The cover slide text is the cover above, unchanged. Every body slide delivers on it.',
    SHORT_RULE,
    `The CTA names ${productName} and one real feature from the Features list by what it does.`,
    'numbered follows the post type. source_note is an empty string.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the model answers for a short make. */
export type ShortRaw = {
  cover_shot?: unknown;
  cta?: { text?: unknown; shot?: unknown; feature_id?: unknown } | null;
  caption?: unknown;
  hashtags?: unknown;
  search_phrase?: unknown;
};

/** The task and answer shape of a short make (Story or Long text). */
export function shortRules(productName: string, format: Format, typeId: string, kind: Kind, idea: MakeIdea): string {
  const longText = format === 'reel' && typeId === 'longtext';
  const spec = specFor(format, typeId);
  return [
    kind === 'story' ? storyNote(format) : `LONG TEXT REEL: ${spec.what} ${spec.cover} ${spec.cta}`,
    `THE COVER, fixed word for word (never rewrite it): ${idea.cover.replace(/\n+/g, ' / ')}`,
    idea.angle ? `Why it works: ${idea.angle}` : '',
    kind === 'story' && idea.outline.length ? `Beats the manager had in mind (creators tell their own version; use them only to aim the CTA): ${idea.outline.join(' | ')}` : '',
    longText
      ? 'TASK: write cover_shot (what the creator does on camera during the clip, one plain line) and the CTA line shown as the last line of the block.'
      : format === 'reel'
        ? `TASK: write cover_shot, the hook the creator says first (5 to 12 words${idea.say ? `; keep this one unless it breaks a rule: ${idea.say}` : ''}), and the CTA slide. There are no body points: each creator records their own.`
        : 'TASK: write cover_shot (the photo the creator takes for the cover) and the CTA slide. There are no body slides: each creator writes their own.',
    `The CTA is first person, ${longText ? '6 to 16 words' : 'one or two short lines'}, names ${productName} and says the one real thing it does for this exact problem, so it works wherever the creator puts it. cta.shot is ${format === 'reel' ? 'the cue the creator says for it' : 'the photo the creator takes for it'}${longText ? ' (an empty string for Long text)' : ''}. cta.feature_id is copied from the Features list.`,
    SHORT_RULE,
    'ANSWER with one JSON object and nothing else: {"cover_shot": string, "cta": {"text": string, "shot": string, "feature_id": string | null}, "caption": string, "hashtags": string[], "search_phrase": string}. Put a line break inside text as " / ". Fill caption, hashtags and search_phrase.',
  ]
    .filter(Boolean)
    .join('\n');
}

export type ShortMade = {
  format: Format;
  post_type_id: string;
  kind: Kind;
  cover: string;
  say: string;
  slides: { role: 'cover' | 'cta'; text: string; shot: string; feature_id: string | null; place?: CtaPlace }[];
  caption: string;
  hashtags: string[];
  search_phrase: string;
  source_note: string;
  warnings: string[];
};

/** A short make made valid: the pinned cover, one CTA, details. Throws without a CTA. */
export function normalizeShort(
  raw: ShortRaw,
  opts: {
    format: Format;
    typeId: string;
    kind: Kind;
    idea: MakeIdea;
    productName: string;
    known: Set<string>;
    fromModel: (t: unknown) => string;
    clean: (t: unknown) => string;
  },
): ShortMade {
  const { format, idea } = opts;
  const cta = raw.cta && typeof raw.cta === 'object' ? raw.cta : {};
  const ctaText = opts.fromModel(cta.text);
  if (!ctaText) throw new Error('The AI wrote no CTA. Try again.');
  const longText = format === 'reel' && opts.typeId === 'longtext';
  const shotOut = opts.fromModel(raw.cover_shot).replace(/\n+/g, ' ');
  // A reel's spoken hook from the card wins; Long text's shot is the on camera action.
  const coverShot = format === 'reel' && !longText && idea.say ? idea.say : shotOut;
  const feature = typeof cta.feature_id === 'string' && opts.known.has(cta.feature_id) ? cta.feature_id : null;
  const hashtags = [
    ...new Set(
      (Array.isArray(raw.hashtags) ? raw.hashtags : [])
        .map((h) => String(h).replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 5);
  const warnings: string[] = [];
  if (opts.productName && !ctaText.toLowerCase().includes(opts.productName.toLowerCase())) warnings.push(`the CTA does not name ${opts.productName}`);
  return {
    format,
    post_type_id: opts.typeId,
    kind: opts.kind,
    cover: idea.cover,
    say: format === 'reel' ? coverShot : '',
    slides: [
      { role: 'cover', text: idea.cover, shot: coverShot, feature_id: null },
      { role: 'cta', text: ctaText, shot: longText ? '' : opts.fromModel(cta.shot), feature_id: longText ? null : feature, place: 'any' },
    ],
    caption: opts.clean(raw.caption),
    hashtags,
    search_phrase: opts.clean(raw.search_phrase).toLowerCase(),
    source_note: '',
    warnings,
  };
}
