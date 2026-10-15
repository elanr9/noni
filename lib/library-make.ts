// The Library makes posts in the new slides format. A typed idea, or a pasted
// TikTok or Instagram post plus what ours should be about, goes through
// write-deck make mode and lands as a real brief (kind, post type, slides with
// the CTA boxes the editor sets, caption, hashtags, search phrase), status
// ready, that belongs to no week. The library row links it in the column of
// its format. "Add to week" copies it into the first empty slot of that
// format in an open week.
//
// A reference is read first by study-reference (scrape, transcript or slide
// text, pattern card), cached in reference_studies; the client polls that row
// so the Library's steps follow what is really happening.

import { CTA_BOXES } from '../components/admin/briefs/canvas/layout';
import { postTypesFor } from './brief-copy';
import {
  addBriefToWeek,
  briefWeekRangeLabel,
  briefWeekStatus,
  getWeekBrief,
  listCampaignBriefs,
  listCampaigns,
  resolvePostTypeId,
  toBriefFormat,
  weekLanesFromItems,
  type BriefMediaFormat,
  type BriefSlide,
  type Campaign,
  type CampaignBriefItem,
  type WeekBrief,
  type WeekBriefInput,
  type WeekSlot,
} from './briefs-api';
import { makePost, type MakeResult } from './deck-ai';
import { enrichReference, markLibraryItemUsed, type LibraryItem, type LibraryItemWithBriefs, type ReadyBrief } from './library-api';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Phases

/** What a make is doing right now. Each one is a real call or wait. */
export type MakePhase = 'reading' | 'transcribing' | 'reading_slides' | 'studying' | 'writing' | 'saving';

export type MakeStep = { id: MakePhase; label: string };

/** The live steps a make card shows, in order. */
export function makeSteps(source: 'idea' | 'reference', phase: MakePhase | null): MakeStep[] {
  if (source === 'idea') {
    return [
      { id: 'writing', label: 'Writing ours' },
      { id: 'saving', label: 'Saving it' },
    ];
  }
  return [
    { id: 'reading', label: 'Reading the post' },
    phase === 'reading_slides' ? { id: 'reading_slides', label: 'Reading the slides' } : { id: 'transcribing', label: 'Transcribing' },
    { id: 'studying', label: 'Studying the structure' },
    { id: 'writing', label: 'Writing ours' },
  ];
}

/** Index of the active step; saving counts as the last step of a reference. */
export function activeStepIndex(steps: MakeStep[], phase: MakePhase | null): number {
  if (!phase) return 0;
  const at = steps.findIndex((s) => s.id === phase);
  if (at >= 0) return at;
  return phase === 'saving' ? steps.length - 1 : 0;
}

/** Pure: a reference_studies row to the phase it is in, or done / failed. */
export function studyState(row: { status?: string | null; phase?: string | null } | null): MakePhase | 'done' | 'failed' {
  if (!row) return 'reading';
  if (row.status === 'done') return 'done';
  if (row.status === 'failed') return 'failed';
  const p = row.phase;
  return p === 'transcribing' || p === 'reading_slides' || p === 'studying' ? p : 'reading';
}

/** Mirrors normalizeReferenceUrl in supabase/functions/_shared/referenceStudy.ts. */
export function normalizeReferenceUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url.trim();
  }
}

// ---------------------------------------------------------------------------
// Pure: the made post as a brief

/** The CTA slide's boxes, exactly as the editor sets them when a feature is plugged. */
function ctaBoxes(): Pick<BriefSlide, 'box' | 'inset_box' | 'box_ig' | 'inset_box_ig'> {
  return {
    box: { ...CTA_BOXES.box },
    inset_box: { ...CTA_BOXES.inset_box },
    box_ig: { ...CTA_BOXES.box_ig },
    inset_box_ig: { ...CTA_BOXES.inset_box_ig },
  };
}

/**
 * The deck the editor and the creator app read: text and shot per slide, the
 * CTA's feature screenshot inset with the editor's CTA boxes, and its place.
 */
export function slidesFromMake(made: Pick<MakeResult, 'slides'>): BriefSlide[] {
  return made.slides.map((s) => {
    const slide: BriefSlide = { role: s.role, text: s.text, shot: s.shot, inset_feature_id: null };
    if (s.role !== 'cta') return slide;
    const withFeature: BriefSlide = s.featureId ? { ...slide, inset_feature_id: s.featureId, ...ctaBoxes() } : slide;
    return { ...withFeature, place: s.place ?? 'any' };
  });
}

/** The save input for a made post, the same shape the editor's save writes. */
export function inputFromMake(made: MakeResult, postTypeId: string | null): WeekBriefInput {
  const slides = slidesFromMake(made);
  const cta = slides.find((s) => s.role === 'cta');
  return {
    kind: 'handheld',
    postTypeId,
    title: slides[0]?.text.trim() || made.cover,
    caption: made.caption,
    searchTerm: made.searchPhrase,
    hashtags: made.hashtags,
    slides,
    story: null,
    open: null,
    cta: { text: cta?.text ?? '', featureId: cta?.inset_feature_id ?? null },
    creatorNote: null,
  };
}

/** A brief as the save input, for copying it into a week slot unchanged. */
export function inputFromBrief(brief: WeekBrief): WeekBriefInput {
  return {
    kind: brief.kind,
    postTypeId: brief.postTypeId,
    title: brief.title,
    caption: brief.caption,
    searchTerm: brief.searchTerm,
    hashtags: brief.hashtags,
    slides: brief.slides,
    story: brief.story,
    open: brief.open,
    cta: brief.cta,
    creatorNote: brief.creatorNote,
  };
}

// ---------------------------------------------------------------------------
// Pure: library rows and their made post

/** The made post of a row in this format, else the one it has. */
export function madeBriefOf(item: LibraryItemWithBriefs, format?: BriefMediaFormat): ReadyBrief | null {
  if (format === 'slideshow') return item.carousel_brief;
  if (format === 'reel') return item.video_brief;
  return item.carousel_brief ?? item.video_brief;
}

/** A made post in the new format; old talking points posts only open in the old editor. */
export function isNewFormat(brief: Pick<ReadyBrief, 'kind'>): boolean {
  return brief.kind === 'handheld' || brief.kind === 'story' || brief.kind === 'open';
}

/** What a library card shows of its post: the cover and the first body lines. */
export function previewOf(brief: ReadyBrief, lines = 3): { cover: string; lines: string[] } {
  const slides = Array.isArray(brief.slides) ? (brief.slides as { role?: unknown; text?: unknown }[]) : [];
  const texts = slides.map((s) => ({ role: s?.role, text: typeof s?.text === 'string' ? s.text.replace(/\s*\n\s*/g, ' ').trim() : '' }));
  if (texts.length) {
    const cover = texts.find((s) => s.role === 'cover')?.text || brief.title;
    return { cover, lines: texts.filter((s) => s.role !== 'cover' && s.text).slice(0, lines).map((s) => s.text) };
  }
  // Old format: talking points.
  const points = Array.isArray(brief.talking_points) ? (brief.talking_points as { text?: unknown }[]) : [];
  return {
    cover: brief.title || brief.hook?.trim() || '',
    lines: points.map((p) => (typeof p?.text === 'string' ? p.text.trim() : '')).filter(Boolean).slice(0, lines),
  };
}

// ---------------------------------------------------------------------------
// Pure: which week slot a made post goes into

/** A slot a made post can go into, with what the picker shows. */
export type TargetSlot = {
  campaign: Campaign;
  /** "This week" or "Next week", then the dates. */
  weekLabel: string;
  slot: WeekSlot;
};

/** Weeks still being planned or running today, soonest first. */
export function openWeeks(campaigns: Campaign[]): { campaign: Campaign; status: 'next' | 'current' }[] {
  const out: { campaign: Campaign; status: 'next' | 'current' }[] = [];
  for (const c of campaigns) {
    const { status } = briefWeekStatus(c);
    if (status === 'next' || status === 'current') out.push({ campaign: c, status });
  }
  // Weeks without a date go last.
  return out.sort((a, b) => ((a.campaign.drop_date ?? '9999') < (b.campaign.drop_date ?? '9999') ? -1 : 1));
}

/**
 * A slot is empty when the new editor has nothing in it (no kind) and the old
 * one did not write it either, so a copy never overwrites someone's post.
 */
export function isEmptySlotRow(row: CampaignBriefItem['briefs']): boolean {
  if (row.kind || row.kill_reason || row.archived_at) return false;
  if (Array.isArray(row.slides) && row.slides.length > 0) return false;
  if (Array.isArray(row.talking_points) && row.talking_points.length > 0) return false;
  return !row.hook?.trim() && !row.script?.trim();
}

/** The first empty slot of this format in one week, in lane order. */
export function firstEmptySlot(campaign: Campaign, items: CampaignBriefItem[], format: BriefMediaFormat): WeekSlot | null {
  const lanes = weekLanesFromItems(campaign, items);
  const rows = new Map(items.map((i) => [i.briefs.id, i.briefs]));
  return (
    lanes[format].find((s) => {
      const row = rows.get(s.briefId);
      return s.brief === null && row !== undefined && isEmptySlotRow(row);
    }) ?? null
  );
}

/**
 * Where Add to week puts it: one target goes straight in, several open weeks
 * with room let the manager pick, none means every slot of that format is
 * taken.
 */
export function pickTargetSlot(
  targets: TargetSlot[],
): { kind: 'one'; target: TargetSlot } | { kind: 'choose'; targets: TargetSlot[] } | { kind: 'none' } {
  if (targets.length === 0) return { kind: 'none' };
  if (targets.length === 1) return { kind: 'one', target: targets[0] };
  return { kind: 'choose', targets };
}

// ---------------------------------------------------------------------------
// I/O

/** Every open week with an empty slot of this format, soonest first. */
export async function listTargetSlots(format: BriefMediaFormat): Promise<TargetSlot[]> {
  const weeks = openWeeks(await listCampaigns());
  const found = await Promise.all(
    weeks.map(async ({ campaign, status }): Promise<TargetSlot | null> => {
      const slot = firstEmptySlot(campaign, await listCampaignBriefs(campaign.id), format);
      if (!slot) return null;
      const dates = campaign.drop_date ? briefWeekRangeLabel(campaign.drop_date) : 'no dates yet';
      return { campaign, slot, weekLabel: `${status === 'current' ? 'This week' : 'Next week'}, ${dates}` };
    }),
  );
  return found.filter((t): t is TargetSlot => t !== null);
}

/**
 * Copies the made post into the slot: every new column through addBriefToWeek,
 * so the slot is filled and ready for creators. The library row is marked used.
 */
export async function addMadeToSlot(params: { item: LibraryItem; madeBriefId: string; slotBriefId: string }): Promise<void> {
  const made = await getWeekBrief(params.madeBriefId);
  if (!made) throw new Error('This post is in the old format. Tap Redo to make it again first.');
  await addBriefToWeek(params.slotBriefId, inputFromBrief(made));
  const { data: src } = await supabase.from('briefs').select('example_url').eq('id', params.madeBriefId).maybeSingle();
  if (src?.example_url) await supabase.from('briefs').update({ example_url: src.example_url }).eq('id', params.slotBriefId);
  // The learning loop compares the manager's later edits against this.
  const snap = await supabase.rpc('snapshot_ai_brief', {
    p_brief_id: params.slotBriefId,
    p_source_kind: params.item.source === 'reference' ? 'example' : 'idea',
  });
  if (snap.error) console.warn('snapshot_ai_brief failed:', snap.error.message);
  await markLibraryItemUsed(params.item, params.slotBriefId);
}

/** Saves a new idea or reference row first, so a failed make still shows with Retry. */
export async function createLibraryItem(params: {
  companyId: string;
  userId: string;
  source: { kind: 'idea'; text: string } | { kind: 'reference'; url: string; direction?: string | null };
}): Promise<LibraryItem> {
  const { source } = params;
  const { data, error } = await supabase
    .from('library_items')
    .insert(
      source.kind === 'idea'
        ? { company_id: params.companyId, source: 'idea', text: source.text.trim(), created_by: params.userId }
        : {
            company_id: params.companyId,
            source: 'reference',
            url: source.url.trim(),
            notes: source.direction?.trim() || null,
            created_by: params.userId,
          },
    )
    .select('*')
    .single();
  if (error) throw error;
  if (source.kind === 'reference') void enrichReference(data.id, source.url);
  return data;
}

const POLL_MS = 1500;
/** The scrape alone can take a few minutes on a slow post. */
const STUDY_TIMEOUT_MS = 6 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads the reference: queues study-reference for the library row, then
 * follows its reference_studies row until it is done. Returns the study id.
 */
export async function studyLink(params: {
  companyId: string;
  item: LibraryItem;
  onPhase: (phase: MakePhase) => void;
  isCancelled?: () => boolean;
}): Promise<string> {
  params.onPhase('reading');
  const { error } = await supabase.functions.invoke('study-reference', { body: { library_item_id: params.item.id } });
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<unknown>; status?: number } }).context;
    const body = typeof ctx?.json === 'function' ? ((await ctx.json().catch(() => null)) as { error?: unknown } | null) : null;
    if (ctx?.status === 404 && !body) throw new Error('Reading posts is not set up on the server yet. Deploy study-reference.');
    throw new Error(typeof body?.error === 'string' ? body.error : 'Could not start reading this post. Try again.');
  }
  const key = normalizeReferenceUrl(params.item.url ?? '');
  const started = Date.now();
  for (;;) {
    if (params.isCancelled?.()) throw new Error('Stopped');
    const { data, error: readError } = await supabase
      .from('reference_studies')
      .select('*')
      .eq('company_id', params.companyId)
      .eq('url', key)
      .maybeSingle();
    if (readError) throw readError;
    const state = studyState(data);
    if (state === 'done') {
      if (data) return data.id;
      continue;
    }
    if (state === 'failed') {
      // A post with words but no pattern card can still be remixed.
      const slides = Array.isArray(data?.slide_texts) ? (data.slide_texts as unknown[]) : [];
      if (data && (data.transcript?.trim() || slides.some((t) => typeof t === 'string' && t.trim()))) return data.id;
      throw new Error(data?.error || 'Could not read this post. Try another link.');
    }
    params.onPhase(state);
    if (Date.now() - started > STUDY_TIMEOUT_MS) throw new Error('Reading this post took too long. Tap Retry.');
    await sleep(POLL_MS);
  }
}

/** The library_items column a made post of this format links through. */
function linkColumn(format: BriefMediaFormat): 'carousel_brief_id' | 'video_brief_id' {
  return format === 'slideshow' ? 'carousel_brief_id' : 'video_brief_id';
}

// Post type ids per company and key for the session.
const typeIds = new Map<string, Promise<string>>();
function postTypeIdFor(companyId: string, format: BriefMediaFormat, typeId: string): Promise<string | null> {
  const spec = postTypesFor(format).find((t) => t.id === typeId);
  if (!spec) return Promise.resolve(null);
  const k = `${companyId}:${spec.key}`;
  let p = typeIds.get(k);
  if (!p) {
    p = resolvePostTypeId(companyId, spec);
    p.catch(() => typeIds.delete(k));
    typeIds.set(k, p);
  }
  return p;
}

/**
 * Makes (or remakes) the post for a library row and links it. A reference is
 * read first. Redo passes the post it replaces: same format, a fresh take,
 * written over the same brief so its link stays valid.
 */
export async function makeForItem(params: {
  companyId: string;
  userId: string;
  item: LibraryItem;
  /** null: the AI picks (ideas only; a reference keeps its own). */
  format: BriefMediaFormat | null;
  postTypeId?: string | null;
  /** The post this make replaces (Redo). */
  replace?: { briefId: string; format: BriefMediaFormat; cover: string } | null;
  onPhase: (phase: MakePhase) => void;
  isCancelled?: () => boolean;
}): Promise<{ briefId: string; format: BriefMediaFormat; result: MakeResult }> {
  const { item } = params;
  const reference = item.source === 'reference';
  const referenceId = reference
    ? await studyLink({ companyId: params.companyId, item, onPhase: params.onPhase, isCancelled: params.isCancelled })
    : undefined;
  if (params.isCancelled?.()) throw new Error('Stopped');
  params.onPhase('writing');
  const result = await makePost({
    idea: reference ? undefined : (item.text ?? ''),
    referenceId,
    direction: reference ? (item.notes ?? undefined) : undefined,
    format: params.replace?.format ?? params.format,
    postTypeId: params.postTypeId ?? null,
    avoid: params.replace?.cover ? [params.replace.cover] : undefined,
  });
  params.onPhase('saving');
  const postTypeId = await postTypeIdFor(params.companyId, result.format, result.postTypeId);
  const input = inputFromMake(result, postTypeId);

  let briefId = params.replace && params.replace.format === result.format ? params.replace.briefId : null;
  if (!briefId) {
    const { data, error } = await supabase
      .from('briefs')
      .insert({
        company_id: params.companyId,
        created_by: params.userId,
        title: input.title || 'Untitled post',
        format: toBriefFormat(result.format),
        library_item_id: item.id,
        example_url: reference ? item.url : null,
      })
      .select('id')
      .single();
    if (error) throw error;
    briefId = data.id;
  }
  await addBriefToWeek(briefId, input);
  // The one line on what the remix kept rides on the brief for the card.
  const note = await supabase.from('briefs').update({ why_it_works: result.sourceNote || null }).eq('id', briefId);
  if (note.error) console.warn('source note not saved:', note.error.message);
  // Link it now, so a later failure never leaves the post unlinked.
  const { error: linkError } = await supabase
    .from('library_items')
    .update(linkColumn(result.format) === 'carousel_brief_id' ? { carousel_brief_id: briefId } : { video_brief_id: briefId })
    .eq('id', item.id);
  if (linkError) throw linkError;
  return { briefId, format: result.format, result };
}
