// The clip plan for a reel, ported from reference_ui/briefs/RLCreator.jsx
// clipPlan and PLUG. Handheld: one clip per point, the plug right after the
// hook, last, or where the manager put it when the creator decides. Story:
// the hook clip, free clips, then the plug (or hook, plug, then free clips
// when the CTA is locked right after the hook). Freestyle: free clips, then
// the plug. Long text: one 6 second clip with the text already on it.
import type { BriefSlide, CtaPlacement, SlideBox, SlideRole, SlideTextStyle, WeekBrief } from '../../../../lib/briefs-api';
import type { Json } from '../../../../lib/types';
import { ctaPlace, hashSeed, isOrderFree, renumber, seededRandom, withCtaAt } from '../model';

export const LONG_TEXT_TARGET_MS = 6000;

export type ReelPlanItem = {
  id: string;
  role: SlideRole;
  /** On screen text (the point label, the long text, the plug line). */
  text: string;
  /** Teleprompter line. */
  say: string;
  /** The creator added this clip on their own (Story middle, Freestyle). */
  free: boolean;
  insetFeatureId: string | null;
  box?: SlideBox;
  insetBox?: SlideBox;
  tstyle?: SlideTextStyle;
  /** Stop recording at this length, Long text only. */
  targetMs?: number;
  /** Blocks in the studio document that belong to this item, first is the main take. */
  blockIds: string[];
  /** Index into brief.slides this item came from (Handheld), so a changed brief maps back. */
  slideIndex?: number;
  /** The creator deleted this item's text overlay; the sync must not put it back. */
  hideText?: boolean;
  /** The creator deleted the plug screenshot; the sync must not put it back. */
  hideInset?: boolean;
};

export type ReelMeta = { caption: string; tags: string; search: string; cuts: number };

export const EMPTY_META: ReelMeta = { caption: '', tags: '', search: '', cuts: 0 };

let seq = 0;
export function nextPlanId(): string {
  seq += 1;
  return `rp${Date.now().toString(36)}${seq.toString(36)}`;
}

export function freeClipItem(): ReelPlanItem {
  return { id: nextPlanId(), role: 'point', text: '', say: '', free: true, insetFeatureId: null, blockIds: [] };
}

export function plugItem(text: string, featureId: string | null, say: string): ReelPlanItem {
  return {
    id: nextPlanId(),
    role: 'cta',
    text,
    say,
    free: false,
    insetFeatureId: featureId,
    box: { x: 0.44, y: 0.58, w: 0.66 },
    insetBox: { x: 0.44, y: 0.3, w: 0.42 },
    tstyle: { size: 0.82 },
    blockIds: [],
  };
}

export const PLUG_SAY = 'Say it while the recording plays';

/** The CTA locked right after the hook: the plug is the second clip and free clips follow it. */
export function plugFirst(brief: Pick<WeekBrief, 'kind' | 'slides' | 'story'>): boolean {
  return ctaPlace(brief) === 'after_hook';
}

/**
 * The plan with a locked plug back in its place: right after the hook, or
 * last. Any (the creator places it) returns the plan as it is.
 */
export function lockPlan(items: ReelPlanItem[], place: CtaPlacement): ReelPlanItem[] {
  if (place === 'any') return items;
  const at = items.findIndex((p) => p.role === 'cta');
  if (at < 0) return items;
  const cover = items.findIndex((p) => p.role === 'cover');
  if (at === (place === 'after_hook' ? cover + 1 : items.length - 1)) return items;
  return withPlug(items.filter((_, k) => k !== at), items[at], place === 'after_hook');
}

/**
 * The plan with a new free clip in its place: before a plug that closes the
 * reel, at the end when the plug opens it (first: right after the hook).
 */
export function withFreeClip(items: ReelPlanItem[], item: ReelPlanItem, first = false): ReelPlanItem[] {
  const at = items.findIndex((p) => p.role === 'cta');
  if (at < 0 || first) return [...items, item];
  return [...items.slice(0, at), ...items.slice(at + 1), item, items[at]];
}

/** The plan with the plug in its place: right after the hook, or last. */
export function withPlug(items: ReelPlanItem[], plug: ReelPlanItem, first: boolean): ReelPlanItem[] {
  const rest = items.filter((p) => p.role !== 'cta');
  if (!first) return [...rest, plug];
  const cover = rest.findIndex((p) => p.role === 'cover');
  return [...rest.slice(0, cover + 1), plug, ...rest.slice(cover + 1)];
}
export const LONG_TEXT_SAY = 'Six seconds. Look at the camera, the text does the talking.';

/**
 * creatorSlides (model.ts) for a reel, keeping each slide's index in the
 * brief: cover first, order free points shuffled with the CTA in its place
 * (after the hook, last, or where the manager put it), leading numbers renumbered.
 */
function handheldSlides(slides: BriefSlide[], orderFree: boolean, seed: string | undefined, place: CtaPlacement): { s: BriefSlide; index: number }[] {
  const indexed = slides.map((s, index) => ({ s, index }));
  const cover = indexed.find((x) => x.s.role === 'cover');
  const body = indexed.filter((x) => x.s.role !== 'cover');
  const ctaAt = body.findIndex((x) => x.s.role === 'cta');
  let points = body.filter((x) => x.s.role !== 'cta');
  if (orderFree) {
    const rand = seed ? seededRandom(hashSeed(seed)) : Math.random;
    points = [...points];
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
  }
  const ordered = ctaAt >= 0 ? withCtaAt(points, body[ctaAt], ctaAt, place) : points;
  const renumbered = ordered.map((x, k) => ({
    ...x,
    s: { ...x.s, text: renumber(x.s.text, k + 1) },
  }));
  return cover ? [cover, ...renumbered] : renumbered;
}

/** seed (the assignment id) keeps an order free shuffle stable across rebuilds. */
export function clipPlan(brief: WeekBrief, seed?: string): ReelPlanItem[] {
  if (brief.postTypeKey === 'long_text') {
    const cover = brief.slides.find((s) => s.role === 'cover');
    return [
      {
        id: nextPlanId(),
        role: 'cover',
        text: cover?.text || brief.title,
        say: LONG_TEXT_SAY,
        free: false,
        insetFeatureId: null,
        targetMs: LONG_TEXT_TARGET_MS,
        tstyle: { size: 0.6, align: 'left', bg: 'none' },
        box: { x: 0.5, y: 0.42, w: 0.86 },
        blockIds: [],
      },
    ];
  }
  if (brief.kind === 'handheld') {
    return handheldSlides(brief.slides, isOrderFree(brief.postTypeKey), seed, ctaPlace(brief)).map(({ s, index }) => ({
      id: nextPlanId(),
      role: s.role,
      text: s.text,
      say: s.role === 'cta' && !s.shot ? PLUG_SAY : s.shot,
      free: false,
      insetFeatureId: s.inset_feature_id,
      ...(s.box ? { box: s.box } : {}),
      ...(s.inset_box ? { insetBox: s.inset_box } : {}),
      ...(s.tstyle ? { tstyle: s.tstyle } : {}),
      blockIds: [],
      slideIndex: index,
    }));
  }
  if (brief.kind === 'story') {
    const cover = brief.slides.find((s) => s.role === 'cover');
    const hook: ReelPlanItem = {
      id: nextPlanId(),
      role: 'cover',
      text: brief.title,
      say: cover?.shot || brief.story?.theme || brief.title,
      free: false,
      insetFeatureId: null,
      blockIds: [],
    };
    // CTA right after the hook: the plug is planned up front as the second clip.
    if (plugFirst(brief)) return [hook, storyPlug(brief)];
    return [hook];
  }
  return [];
}

/** The Story plug: the brief's CTA line (as the creator's own plug gets it), with the CTA slide's say line and design. */
function storyPlug(brief: WeekBrief): ReelPlanItem {
  const row = brief.slides.find((s) => s.role === 'cta');
  const base = plugItem(brief.cta.text.trim() || row?.text.trim() || '', brief.cta.featureId ?? row?.inset_feature_id ?? null, row?.shot.trim() || PLUG_SAY);
  return {
    ...base,
    ...(row?.box ? { box: row.box } : {}),
    ...(row?.inset_box ? { insetBox: row.inset_box } : {}),
    ...(row?.tstyle ? { tstyle: row.tstyle } : {}),
  };
}

export function isGuided(brief: WeekBrief): boolean {
  return brief.kind === 'handheld';
}

/** Every planned clip recorded, plus at least one free clip for Story and Freestyle. */
export function planReady(brief: WeekBrief, items: ReelPlanItem[]): boolean {
  const recorded = (p: ReelPlanItem) => p.blockIds.length > 0;
  const own = items.filter((p) => p.free && recorded(p)).length;
  if (brief.kind === 'handheld') return items.length > 0 && items.every(recorded);
  if (brief.kind === 'open') return own >= 1;
  const hasPlug = items.some((p) => p.role === 'cta');
  return hasPlug && items.every(recorded) && own >= 1;
}

export function prompterLabel(item: ReelPlanItem, guided: boolean, opener = false): string {
  if (item.targetMs) return 'Just look at the camera';
  if (item.role === 'cover') return 'Your hook';
  if (item.role === 'cta') return opener ? 'Your plug \u00b7 say why you use it, then tell your story' : 'Your plug \u00b7 say it like a tip';
  return guided ? 'Say something like' : '';
}

// ---------------------------------------------------------------------------
// Plan revisions. The plan is stored with a fingerprint of the brief so a
// manager's edit (text, say line, points added or removed) reaches a creator
// who already started.

/** Fingerprint of everything in a brief the plan is built from. */
export function briefRev(brief: WeekBrief): string {
  // Only the non default CTA placement joins, so plans saved before it keep their rev.
  // Handheld placement rides in brief.slides (the CTA's place).
  const src = JSON.stringify([brief.kind, brief.postTypeKey, brief.title, brief.slides, brief.cta, brief.story?.theme ?? null, ...(brief.kind === 'story' && plugFirst(brief) ? ['cta_after_hook'] : [])]);
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
  return `${brief.kind}:${h.toString(36)}:${src.length.toString(36)}`;
}

/**
 * A fresh plan for the brief with the creator's takes carried over: each
 * planned item takes the id and blocks of the old item for the same brief
 * slide (or, for plans saved before slide indexes, the same role and
 * position), keeps the creator's order, and gets the brief's current text and
 * say line. Free clips stay; a planned item the brief dropped stays as a free
 * clip when it has takes. Story and Freestyle keep the plug the creator added.
 */
export function rebuildPlan(brief: WeekBrief, old: ReelPlanItem[], seed?: string): ReelPlanItem[] {
  const fresh = clipPlan(brief, seed);
  const oldFixed = old.filter((p) => !p.free && !(brief.kind !== 'handheld' && p.role === 'cta'));
  const used = new Set<string>();
  const pick = new Map<number, ReelPlanItem>();
  // Three passes, strongest first: the same say line, the same brief slide,
  // then (plans saved before slide indexes) the next unused item of the role.
  const passes: ((f: ReelPlanItem, o: ReelPlanItem) => boolean)[] = [
    (f, o) => f.say.trim() !== '' && o.say === f.say,
    (f, o) => f.slideIndex !== undefined && o.slideIndex === f.slideIndex,
    (_f, o) => o.slideIndex === undefined,
  ];
  for (const test of passes) {
    fresh.forEach((f, i) => {
      if (pick.has(i)) return;
      const m = oldFixed.find((o) => !used.has(o.id) && o.role === f.role && test(f, o));
      if (!m) return;
      used.add(m.id);
      pick.set(i, m);
    });
  }
  const matched = fresh.map((f, i) => {
    const m = pick.get(i);
    return { item: m ? { ...f, id: m.id, blockIds: m.blockIds } : f, oldAt: m ? old.indexOf(m) : -1 };
  });
  // Matched items keep the creator's order; new ones go where the brief puts them.
  const out: ReelPlanItem[] = matched
    .filter((x) => x.oldAt >= 0)
    .sort((a, b) => a.oldAt - b.oldAt)
    .map((x) => x.item);
  matched.forEach((x, freshAt) => {
    if (x.oldAt < 0) out.splice(Math.min(freshAt, out.length), 0, x.item);
  });
  const extras = old.filter(
    (p) => p.free || (!used.has(p.id) && p.blockIds.length > 0 && !(brief.kind !== 'handheld' && p.role === 'cta')),
  );
  const freed = extras.map((p) => (p.free ? p : { ...p, free: true, role: 'point' as const, say: '', insetFeatureId: null, slideIndex: undefined }));
  const oldPlug = brief.kind !== 'handheld' ? old.find((p) => p.role === 'cta' && !p.free) : undefined;
  if (brief.kind !== 'handheld') {
    // Story and Freestyle: the creator's plug keeps its id and takes; a
    // plug planned up front (CTA right after the hook) fills in for none.
    const planned = out.find((p) => p.role === 'cta');
    const rest = out.filter((p) => p.role !== 'cta');
    const plug = oldPlug
      ? { ...oldPlug, text: brief.cta.text.trim() || oldPlug.text, insetFeatureId: brief.cta.featureId ?? oldPlug.insetFeatureId }
      : planned;
    if (!plug) return [...rest, ...freed];
    // A locked plug goes to its place; one the creator places and already
    // recorded stays where they have it.
    const firstFree = old.findIndex((p) => p.free);
    let first = plugFirst(brief);
    if (ctaPlace(brief) === 'any' && oldPlug && oldPlug.blockIds.length > 0 && firstFree >= 0) first = old.indexOf(oldPlug) < firstFree;
    return withPlug([...rest, ...freed], plug, first);
  }
  // Handheld: freed clips go before a CTA that closes the reel, after one that opens it.
  const ctaAt = out.findIndex((p) => p.role === 'cta');
  const coverAt = out.findIndex((p) => p.role === 'cover');
  if (ctaAt >= 0 && ctaAt !== coverAt + 1) out.splice(ctaAt, 0, ...freed);
  else out.push(...freed);
  return lockPlan(out, ctaPlace(brief));
}

/** What the document stores next to the timeline. */
export type StoredPlan = { rev: string; items: ReelPlanItem[]; meta: ReelMeta };

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isBox(v: unknown): v is SlideBox {
  return isObj(v) && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.w === 'number';
}

function parseItem(v: unknown): ReelPlanItem | null {
  if (!isObj(v)) return null;
  const { id, role, text, say, free, insetFeatureId, blockIds } = v;
  if (typeof id !== 'string' || (role !== 'cover' && role !== 'point' && role !== 'cta')) return null;
  if (!Array.isArray(blockIds)) return null;
  return {
    id,
    role,
    text: typeof text === 'string' ? text : '',
    say: typeof say === 'string' ? say : '',
    free: free === true,
    insetFeatureId: typeof insetFeatureId === 'string' ? insetFeatureId : null,
    blockIds: blockIds.filter((b): b is string => typeof b === 'string'),
    ...(isBox(v.box) ? { box: v.box } : {}),
    ...(isBox(v.insetBox) ? { insetBox: v.insetBox } : {}),
    ...(isObj(v.tstyle) ? { tstyle: v.tstyle as SlideTextStyle } : {}),
    ...(typeof v.targetMs === 'number' ? { targetMs: v.targetMs } : {}),
    ...(typeof v.slideIndex === 'number' ? { slideIndex: v.slideIndex } : {}),
    ...(v.hideText === true ? { hideText: true } : {}),
    ...(v.hideInset === true ? { hideInset: true } : {}),
  };
}

/** Every item gets its own id (a repeat gets a fresh one), so two items never share an overlay. */
export function uniqueIds(items: ReelPlanItem[]): ReelPlanItem[] {
  const seen = new Set<string>();
  let changed = false;
  const out = items.map((p) => {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      return p;
    }
    changed = true;
    const id = nextPlanId();
    seen.add(id);
    return { ...p, id };
  });
  return changed ? out : items;
}

export function parseStoredPlan(value: Json | null | undefined): StoredPlan | null {
  if (!isObj(value) || typeof value.rev !== 'string' || !Array.isArray(value.items)) return null;
  const items = value.items.map(parseItem);
  if (items.some((p) => p === null)) return null;
  const m = isObj(value.meta) ? value.meta : {};
  return {
    rev: value.rev,
    items: items as ReelPlanItem[],
    meta: {
      caption: typeof m.caption === 'string' ? m.caption : '',
      tags: typeof m.tags === 'string' ? m.tags : '',
      search: typeof m.search === 'string' ? m.search : '',
      cuts: typeof m.cuts === 'number' ? m.cuts : 0,
    },
  };
}

export function storedPlanJson(plan: StoredPlan): Json {
  return JSON.parse(JSON.stringify(plan)) as Json;
}

/**
 * The plan items a manager's per clip notes point at, in plan order. Hook is
 * the cover, Point N the Nth point, Clip N the Nth clip, CTA (Outro, Close,
 * Plug) the plug.
 */
export function flaggedItemIds(items: ReelPlanItem[], labels: string[]): string[] {
  const ids = new Set<string>();
  const points = items.filter((p) => p.role === 'point');
  for (const raw of labels) {
    const label = raw.trim().toLowerCase();
    const point = /^point\s+(\d+)$/.exec(label);
    const clip = /^clip\s+(\d+)$/.exec(label);
    let hit: ReelPlanItem | undefined;
    if (label === 'hook' || label === 'cover') hit = items.find((p) => p.role === 'cover');
    else if (label === 'cta' || label === 'outro' || label === 'close' || label === 'plug') hit = items.find((p) => p.role === 'cta');
    else if (point) hit = points[Number(point[1]) - 1];
    else if (clip) hit = items[Number(clip[1]) - 1];
    if (hit) ids.add(hit.id);
  }
  return items.filter((p) => ids.has(p.id)).map((p) => p.id);
}
