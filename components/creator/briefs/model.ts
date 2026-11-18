// Pure helpers for the creator side of the briefs redesign. Ported from
// reference_ui/briefs/SSCreator.jsx (creatorSlides, buildSlides, roleLabel)
// and SSShared.jsx (layoutOf). Nothing here touches the network.
import type { OverlayBox } from '../../../lib/overlay-boxes';
import type {
  BriefSlide,
  CtaPlacement,
  SlideBox,
  SlideExtra,
  SlidePic,
  SlideRole,
  SlideTextStyle,
  TextSpan,
  WeekBrief,
} from '../../../lib/briefs-api';
import type { PickedPhoto } from '../../../lib/submissions';
import type { TaskStatus } from '../../../lib/tasks';

/** Default letter color written into post documents. Stored data, not a theme color, so it never follows theme changes. */
const STORED_WHITE = '#FFFFFF';

/** Home and sent screen status buckets (SSCreator CREATOR_POSTS.status). */
export type CreatorStatus = 'assigned' | 'review' | 'posted';

export function creatorStatus(status: TaskStatus | string): CreatorStatus {
  switch (status) {
    case 'assigned':
    case 'changes_requested':
      return 'assigned';
    case 'posted':
      return 'posted';
    default:
      return 'review';
  }
}

export type SlidePlatform = 'tiktok' | 'instagram';

export type CreatorSlide = {
  id: string;
  role: SlideRole;
  text: string;
  /** The creator writes this slide (Story middle, every Freestyle slide). */
  own: boolean;
  shot: string;
  insetFeatureId: string | null;
  box?: SlideBox;
  insetBox?: SlideBox;
  boxIg?: SlideBox;
  insetBoxIg?: SlideBox;
  tstyle?: SlideTextStyle;
  /** The manager's extra text boxes and photo stickers, locked on the slide. */
  extras?: SlideExtra[];
  pics?: SlidePic[];
  /** Per word colors on the main text box. */
  spans?: TextSpan[];
  /** Index of the manager slide in brief.slides this was built from; absent on own slides. */
  briefIndex?: number;
  photo: PickedPhoto | null;
};

let seq = 0;
export function nextSlideId(): string {
  seq += 1;
  return `cs${Date.now().toString(36)}${seq.toString(36)}`;
}

function fromBrief(slide: BriefSlide, own = false, briefIndex?: number): CreatorSlide {
  const out: CreatorSlide = {
    id: nextSlideId(),
    role: slide.role,
    text: slide.text,
    own,
    shot: slide.shot,
    insetFeatureId: slide.inset_feature_id,
    photo: null,
  };
  if (briefIndex !== undefined && briefIndex >= 0) out.briefIndex = briefIndex;
  if (slide.box) out.box = slide.box;
  if (slide.inset_box) out.insetBox = slide.inset_box;
  if (slide.box_ig) out.boxIg = slide.box_ig;
  if (slide.inset_box_ig) out.insetBoxIg = slide.inset_box_ig;
  if (slide.tstyle) out.tstyle = slide.tstyle;
  if (slide.extras?.length) out.extras = slide.extras;
  if (slide.pics?.length) out.pics = slide.pics;
  if (slide.spans?.length) out.spans = slide.spans;
  return out;
}

export function ownSlide(role: SlideRole = 'point'): CreatorSlide {
  return { id: nextSlideId(), role, text: '', own: true, shot: '', insetFeatureId: null, photo: null };
}

/** Post types whose points stand alone, so each creator can post them in their own order. */
const ORDER_FREE = new Set(['numbered_tips', 'myths', 'numbered_list', 'talking_head']);

export function isOrderFree(postTypeKey: string | null | undefined): boolean {
  return Boolean(postTypeKey && ORDER_FREE.has(postTypeKey));
}

/** FNV 1a of a string, the seed for the per assignment shuffle. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator, so one assignment always shuffles the same way. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A leading number: "3.", "3)", "3:", "3/" bare, or "Tip 3", "Tip #3",
 * "Myth 3:", "#3" with a label (followed by punctuation, a space or the end).
 */
const LEADING_NUMBER = /^(\s*)(?:((?:Tip|Myth) #?|#)(\d{1,2})(?=[.):/\s]|$)|(\d{1,2})(?=[.):/]))/i;

/** Pure: the text with its leading number, if any, set to n. */
export function renumber(text: string, n: number): string {
  return text.replace(LEADING_NUMBER, (_m, lead: string, label: string | undefined) => `${lead}${label ?? ''}${n}`);
}

/**
 * The body with the CTA in its place: first (right after the hook), last
 * (the very end), or at managerAt, where the manager's deck has it, when the
 * creator decides (their starting point).
 */
export function withCtaAt<T>(points: T[], cta: T, managerAt: number, place: CtaPlacement): T[] {
  const at = place === 'after_hook' ? 0 : place === 'end' ? points.length : Math.max(0, Math.min(managerAt, points.length));
  return [...points.slice(0, at), cta, ...points.slice(at)];
}

/**
 * A Handheld brief as one creator posts it. Order free types (tips, myths)
 * get the points in this creator's own order with the CTA where its
 * placement puts it (right after the hook, last, or where the manager put it
 * when the creator decides); steps (how to, getting started, stories) keep
 * their order. Leading numbers ("3.", "Tip #3", "Myth 3:") are renumbered to
 * the new positions; the CTA is a counted item in these posts, so every body
 * slide is numbered in order. seed (the assignment id) makes the shuffle
 * stable, so coming back to the post never reorders it.
 */
export function creatorSlides(brief: BriefSlide[], orderFree = false, seed?: string, place: CtaPlacement = 'any'): CreatorSlide[] {
  const coverAt = brief.findIndex((s) => s.role === 'cover');
  const body = brief.map((s, k) => (s.role === 'cover' ? null : fromBrief(s, false, k))).filter((s): s is CreatorSlide => s !== null);
  const ctaAt = body.findIndex((s) => s.role === 'cta');
  let points = body.filter((s) => s.role !== 'cta');
  if (orderFree) {
    const rand = seed ? seededRandom(hashSeed(seed)) : Math.random;
    points = [...points];
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
  }
  const ordered = ctaAt >= 0 ? withCtaAt(points, body[ctaAt], ctaAt, place) : points;
  const renumbered = ordered.map((s, k) => ({ ...s, text: renumber(s.text, k + 1) }));
  return coverAt >= 0 ? [fromBrief(brief[coverAt], false, coverAt), ...renumbered] : renumbered;
}

/** The manager's numbered slides renumbered to their place in the body (everything after the cover). */
export function renumberBody(slides: CreatorSlide[]): CreatorSlide[] {
  const coverAt = slides.findIndex((s) => s.role === 'cover');
  let changed = false;
  const out = slides.map((s, k) => {
    if (k <= coverAt || s.own) return s;
    const text = renumber(s.text, k - coverAt);
    if (text === s.text) return s;
    changed = true;
    return { ...s, text };
  });
  return changed ? out : slides;
}

/** Where the CTA slide may go: after the cover (never before it) up to last. */
export function ctaMoves(slides: CreatorSlide[]): { earlier: boolean; later: boolean } {
  const at = slides.findIndex((s) => s.role === 'cta');
  const coverAt = slides.findIndex((s) => s.role === 'cover');
  return { earlier: at > coverAt + 1, later: at >= 0 && at < slides.length - 1 };
}

/**
 * The creator moves the CTA slide one place earlier (-1) or later (1) among
 * the body slides, never before the cover; numbered slides follow their new
 * places. Only for a CTA the creator places (any).
 */
export function moveCtaSlide(slides: CreatorSlide[], dir: -1 | 1): CreatorSlide[] {
  const can = ctaMoves(slides);
  if ((dir < 0 && !can.earlier) || (dir > 0 && !can.later)) return slides;
  const at = slides.findIndex((s) => s.role === 'cta');
  const out = [...slides];
  [out[at], out[at + dir]] = [out[at + dir], out[at]];
  return renumberBody(out);
}

/**
 * The slides with a locked CTA back in its place: right after the cover, or
 * last. Any (the creator places it) returns the slides as they are.
 */
export function lockCta(slides: CreatorSlide[], place: CtaPlacement): CreatorSlide[] {
  if (place === 'any') return slides;
  const at = slides.findIndex((s) => s.role === 'cta');
  if (at < 0) return slides;
  const coverAt = slides.findIndex((s) => s.role === 'cover');
  const want = place === 'after_hook' ? coverAt + 1 : slides.length - 1;
  if (at === want) return slides;
  const rest = slides.filter((_, k) => k !== at);
  rest.splice(place === 'after_hook' ? rest.findIndex((s) => s.role === 'cover') + 1 : rest.length, 0, slides[at]);
  return renumberBody(rest);
}

/** Most slides a document carries (MAX_SLIDES in lib/edit-document.ts). */
export const MAX_POST_SLIDES = 20;

/**
 * How many of their own slides the creator may have. Story reads story.min
 * and story.max; Freestyle reads open.min and open.max (2 and 10 by default).
 * maxTotal caps every slide, the manager's included, at what the render takes.
 */
export function ownSlideLimits(brief: Pick<WeekBrief, 'kind' | 'story' | 'open'>): { min: number; max: number; maxTotal: number } {
  if (brief.kind === 'story') {
    const min = Math.max(1, brief.story?.min ?? 3);
    return { min, max: Math.max(min, brief.story?.max ?? 10), maxTotal: MAX_POST_SLIDES };
  }
  if (brief.kind === 'open') {
    const min = Math.max(1, brief.open?.min ?? 2);
    return { min, max: Math.min(MAX_POST_SLIDES - 1, Math.max(min, brief.open?.max ?? 10)), maxTotal: MAX_POST_SLIDES };
  }
  return { min: 0, max: 0, maxTotal: MAX_POST_SLIDES };
}

/** The brief's CTA placement for the creator: locked after the hook, locked at the end, or any. */
export function ctaPlace(brief: Pick<WeekBrief, 'kind' | 'slides' | 'story'>): CtaPlacement {
  // Same read as ctaPlaceOf in briefs-api (kept here so this file stays pure).
  if (brief.kind === 'open') return 'any';
  return brief.slides.find((s) => s.role === 'cta')?.place ?? brief.story?.ctaAt ?? 'any';
}

/** The slides a creator starts from, per kind (SSCreator buildSlides). seed is the assignment id. */
export function buildSlides(brief: WeekBrief, seed?: string): CreatorSlide[] {
  if (brief.kind === 'story') {
    // The manager designed the cover and the CTA (position, style, inset,
    // extras, stickers); the creator fills story.min slides in between, or
    // after the CTA when the manager put it right after the hook. A CTA the
    // creator places starts last.
    const { min } = ownSlideLimits(brief);
    const coverAt = brief.slides.findIndex((r) => r.role === 'cover');
    const ctaAt = brief.slides.findIndex((r) => r.role === 'cta');
    const coverRow = coverAt >= 0 ? brief.slides[coverAt] : null;
    const ctaRow = ctaAt >= 0 ? brief.slides[ctaAt] : null;
    const cover = coverRow ? fromBrief(coverRow, false, coverAt) : ownSlideWithText('cover', brief.title);
    cover.own = false;
    if (!cover.text.trim()) cover.text = brief.title;
    const cta: CreatorSlide = ctaRow ? fromBrief(ctaRow, false, ctaAt) : { ...ownSlide('cta'), own: false, text: brief.cta.text, insetFeatureId: brief.cta.featureId };
    if (!cta.text.trim()) cta.text = brief.cta.text;
    if (cta.insetFeatureId === null && !ctaRow) cta.insetFeatureId = brief.cta.featureId;
    const own = Array.from({ length: min }, () => ownSlide());
    return ctaPlace(brief) === 'after_hook' ? [cover, cta, ...own] : [cover, ...own, cta];
  }
  if (brief.kind === 'open') return [];
  return creatorSlides(brief.slides, isOrderFree(brief.postTypeKey), seed, ctaPlace(brief));
}

/**
 * What the slides were built from: kind, the slide text after the variant,
 * the CTA and the Story length. A saved draft with another signature is
 * stale (a manager edit, a swap, a variant that landed later).
 */
export function briefSignature(brief: WeekBrief): string {
  const raw = JSON.stringify([
    brief.kind,
    brief.slides.map((s) => [s.role, s.text, s.inset_feature_id]),
    brief.cta.text,
    brief.cta.featureId,
    brief.story?.min ?? null,
    // Only Story's CTA after the hook (its own slides move), so drafts saved
    // before it stay current; the rest of a locked placement is applied by lockCta.
    ...(brief.kind === 'story' && ctaPlace(brief) === 'after_hook' ? ['cta_after_hook'] : []),
  ]);
  return hashSeed(raw).toString(36);
}

/**
 * A stale draft laid onto freshly built slides. Manager slides take the new
 * text and design; a photo moves over only when it clearly belongs to the
 * same slide: same role and same brief slide (briefIndex) when the brief is
 * the same one, the cover and CTA by role. Story keeps every own slide the
 * creator made, text and photo, between the new cover and CTA. lost counts
 * the old photos that found no home.
 */
export function mergeStaleDraft(
  fresh: CreatorSlide[],
  old: CreatorSlide[],
  opts: { kind: WeekBrief['kind']; sameBrief: boolean; place?: CtaPlacement },
): { slides: CreatorSlide[]; carried: number; lost: number } {
  const had = old.filter((s) => s.photo).length;
  const used = new Set<CreatorSlide>();
  const take = (match: (o: CreatorSlide) => boolean): PickedPhoto | null => {
    const hit = old.find((o) => o.photo && !used.has(o) && match(o));
    if (!hit) return null;
    used.add(hit);
    return hit.photo;
  };
  const byRole = (role: SlideRole) => (o: CreatorSlide) => !o.own && o.role === role;
  let slides: CreatorSlide[];
  if (opts.kind === 'story') {
    const cover = fresh.find((s) => s.role === 'cover');
    const cta = fresh.find((s) => s.role === 'cta');
    const own = old.filter((s) => s.own);
    own.forEach((s) => s.photo && used.add(s));
    const middle = own.length ? own : fresh.filter((s) => s.own);
    const head = cover ? [{ ...cover, photo: take(byRole('cover')) }] : [];
    const plug = cta ? [{ ...cta, photo: take(byRole('cta')) }] : [];
    // The fresh slides carry the manager's placement: CTA right after the cover, or last.
    const ctaFirst = cta !== undefined && fresh.indexOf(cta) === (cover ? 1 : 0) && fresh.some((s) => s.own);
    slides = ctaFirst ? [...head, ...plug, ...middle] : [...head, ...middle, ...plug];
  } else {
    slides = fresh.map((s) => {
      if (s.own) return s;
      const photo =
        s.role === 'point'
          ? opts.sameBrief && s.briefIndex !== undefined
            ? take((o) => !o.own && o.role === 'point' && o.briefIndex === s.briefIndex)
            : null
          : opts.sameBrief && s.briefIndex !== undefined
            ? (take((o) => byRole(s.role)(o) && o.briefIndex === s.briefIndex) ?? take(byRole(s.role)))
            : take(byRole(s.role));
      return photo ? { ...s, photo } : s;
    });
  }
  // A CTA the creator places keeps the spot they gave it in the body.
  const oldCta = old.findIndex((s) => s.role === 'cta');
  const newCta = slides.findIndex((s) => s.role === 'cta');
  if ((opts.place ?? 'any') === 'any' && oldCta >= 0 && newCta >= 0) {
    const oldCover = old.findIndex((s) => s.role === 'cover');
    const cover = slides.findIndex((s) => s.role === 'cover');
    const rest = slides.filter((_, k) => k !== newCta);
    rest.splice(Math.max(cover + 1, Math.min(rest.length, cover + (oldCta - oldCover))), 0, slides[newCta]);
    slides = renumberBody(rest);
  }
  const carried = used.size;
  return { slides: lockCta(slides, opts.place ?? 'any'), carried, lost: had - carried };
}

/** The 4:5 placement of a manager sticker: kept clear of the feed chrome like the inset in layoutOf. */
export function picPlacement(box: SlideBox, platform: SlidePlatform): SlideBox {
  return platform === 'instagram' ? { ...box, y: clamp(box.y, 0.26, 0.74) } : box;
}

/** True for a screenshot URL that is really a video (the slide bake only takes stills). */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v|webm|m3u8)(\?|#|$)/i.test(url);
}

function ownSlideWithText(role: SlideRole, text: string): CreatorSlide {
  return { ...ownSlide(role), text };
}

/** Freestyle plug slide added before review when the creator never made one. */
export function plugSlide(text: string, featureId: string | null): CreatorSlide {
  return {
    ...ownSlide('cta'),
    own: false,
    text,
    insetFeatureId: featureId,
    box: { x: 0.44, y: 0.22, w: 0.66 },
    insetBox: { x: 0.44, y: 0.52, w: 0.42 },
    boxIg: { x: 0.5, y: 0.3, w: 0.72 },
    insetBoxIg: { x: 0.5, y: 0.6, w: 0.42 },
    tstyle: { size: 0.82 },
  };
}

export function roleLabel(slide: CreatorSlide, index: number): string {
  if (slide.role === 'cover') return 'Cover slide';
  if (slide.role === 'cta') return 'Your plug';
  if (slide.own) return `Your slide ${index + 1}`;
  return `Tip ${index}`;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Where the text and the inset sit on the slide, as frame fractions (SSShared layoutOf). */
export function layoutOf(
  slide: Pick<CreatorSlide, 'box' | 'insetBox' | 'boxIg' | 'insetBoxIg' | 'insetFeatureId'>,
  platform: SlidePlatform = 'tiktok',
): { text: SlideBox; inset: SlideBox } {
  const hasInset = slide.insetFeatureId !== null;
  if (platform === 'instagram') {
    const inset =
      slide.insetBoxIg ??
      (slide.insetBox ? { ...slide.insetBox, y: clamp(slide.insetBox.y, 0.26, 0.74) } : { x: 0.5, y: 0.6, w: 0.42 });
    const text =
      slide.boxIg ??
      (slide.box
        ? { ...slide.box, y: clamp(slide.box.y, 0.22, 0.78) }
        : hasInset
          ? { x: 0.5, y: 0.3, w: 0.66 }
          : { x: 0.5, y: 0.36, w: 0.66 });
    return { text, inset };
  }
  const inset = slide.insetBox ?? { x: 0.5, y: 0.52, w: 0.42 };
  const text = slide.box ?? (hasInset ? { x: 0.5, y: 0.22, w: 0.66 } : { x: 0.5, y: 0.3, w: 0.66 });
  return { text, inset };
}

/** Prototype text is 0.072 of the frame width times tstyle.size. */
export const SLIDE_TEXT_SIZE = 0.072;

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** A #RRGGBB color the render accepts, or null. */
export function hexColor(value: string | undefined): string | null {
  if (!value) return null;
  if (HEX6.test(value)) return value.toUpperCase();
  const m = HEX3.exec(value);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase() : null;
}

/**
 * The manager's text style as an OverlayBox look. Box and soft draw a bubble
 * in the box color (the render picks a readable ink); outline and none draw
 * bare letters in the letter color. No style at all keeps the white box.
 */
export function textLook(tstyle: SlideTextStyle | undefined): { color: string; bg: boolean } {
  const bg = (tstyle?.bg ?? 'box') === 'box' || tstyle?.bg === 'soft';
  const pick = bg ? hexColor(tstyle?.bgColor) : hexColor(tstyle?.color);
  return { color: pick ?? STORED_WHITE, bg };
}

/** The slide text, plus the manager's extras, as the OverlayBoxes SlideStage draws and the render bakes. */
export function slideBoxes(slide: CreatorSlide, platform: SlidePlatform = 'tiktok'): OverlayBox[] {
  const out: OverlayBox[] = [];
  if (slide.text.trim()) {
    const L = layoutOf(slide, platform);
    out.push({
      id: `${slide.id}-main`,
      text: slide.text,
      ...(slide.spans?.length ? { spans: slide.spans } : {}),
      ...textLook(slide.tstyle),
      size: SLIDE_TEXT_SIZE * (slide.tstyle?.size ?? 1),
      x: L.text.x,
      y: L.text.y,
      width: L.text.w,
    });
  }
  for (const e of slide.extras ?? []) {
    if (!e.text.trim()) continue;
    out.push({
      id: `${slide.id}-x-${e.id}`,
      text: e.text,
      ...(e.spans?.length ? { spans: e.spans } : {}),
      ...textLook(e.tstyle),
      size: SLIDE_TEXT_SIZE * (e.tstyle?.size ?? 1),
      x: e.box.x,
      y: e.box.y,
      width: e.box.w,
    });
  }
  return out;
}

/** Sticker sources the app can show directly; storage paths need a signed URL the lane does not have. */
export function picUri(src: string): string | null {
  return /^(https?:|file:|ph:|assets-library:)/.test(src) ? src : null;
}

export function patchSlideBox(slide: CreatorSlide, platform: SlidePlatform, x: number, y: number): CreatorSlide {
  const L = layoutOf(slide, platform);
  const next = { ...L.text, x, y };
  return platform === 'instagram' ? { ...slide, boxIg: next } : { ...slide, box: next };
}

export function patchSlideInset(slide: CreatorSlide, platform: SlidePlatform, x: number, y: number): CreatorSlide {
  const L = layoutOf(slide, platform);
  const next = { ...L.inset, x, y };
  return platform === 'instagram' ? { ...slide, insetBoxIg: next } : { ...slide, insetBox: next };
}

export function hashtagList(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.replace(/^#/, ''))
    .filter(Boolean);
}

/** Caption and hashtag halves of a stored caption ("text #a #b"). */
export function splitCaption(caption: string): { text: string; tags: string } {
  const [text, ...rest] = caption.split(' #');
  return { text: text ?? '', tags: rest.length ? `#${rest.join(' #')}` : '' };
}

/** Feature tone key from a library title (ss-data library ids). */
export function featureToneKey(
  title: string,
  isGeneral: boolean,
): 'general' | 'bestfit' | 'hl' | 'reply' | 'search' | 'inbox' | 'sent' | 'school' {
  if (isGeneral) return 'general';
  const t = title.toLowerCase();
  if (/hl|highlight|video|film/.test(t)) return 'hl';
  if (/reply|respond|message/.test(t)) return 'reply';
  if (/search|school-search|find/.test(t)) return 'search';
  if (/inbox/.test(t)) return 'inbox';
  if (/sent|campaign|email/.test(t)) return 'sent';
  if (/solo|school|program/.test(t)) return 'school';
  if (/fit|plan/.test(t)) return 'bestfit';
  return 'general';
}
