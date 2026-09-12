// Filling an empty post slot from AI. The editor, the week grid and the
// Library tab all fill the same way, so the sequence lives here once: draft,
// write it into the slot, derive the render manifest, seed the slide text
// boxes, then carry the source post's pictures across.

import {
  addBriefToCampaign,
  assistDeriveSegments,
  briefRowState,
  createBrief,
  DEFAULT_TEXT_OVERLAY,
  findEmptySlot,
  generatePost,
  getOverlayThemeColor,
  listBriefSegments,
  listBriefWeeks,
  listCampaignBriefs,
  portPost,
  resolveTextStyle,
  updateBrief,
  updateBriefSegment,
  type BriefDraft,
  type BriefFormat,
  type BriefSegment,
  type BriefWeekSummary,
  type PointMedia,
  type PostType,
  type TalkingPoint,
} from './briefs-api';
import { placeLibraryItemOnSegment, placeRemoteImageOnSegment } from './media-library-api';
import {
  hasOverlayBoxes,
  newOverlayBox,
  serializeOverlayBoxes,
  type OverlayTextStyle,
} from './overlay-boxes';
import { supabase } from './supabase';
import type { Database } from './types';

/** Where the new post comes from. A port reads a finished post in this company. */
export type FillSource =
  | { kind: 'port'; sourceBriefId: string }
  | { kind: 'example'; url: string; notes?: string | null }
  | { kind: 'idea'; text: string }
  | { kind: 'feature'; featureId: string }
  | { kind: 'media'; mediaId: string };

export type FillResult =
  | {
      kind: 'filled';
      draft: BriefDraft;
      warnings: string[];
      placedScreenshots: number;
    }
  | { kind: 'kill'; kill_reason: string };

/** The editor stores the body and its hashtags merged into briefs.caption. */
function mergeCaption(caption: string, hashtags: string[]): string {
  const body = caption.replace(/#\w+/g, ' ').replace(/\s+/g, ' ').trim();
  const tags = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  return [body, tags].filter(Boolean).join('\n\n');
}

/** What the manager already typed. Kept verbatim; only empty fields are written. */
export type FillKeep = {
  title: string;
  searchPhrase: string;
  hook: string;
  caption: string;
  points: TalkingPoint[];
};

function keepContext(keep: FillKeep): string | undefined {
  const lines: string[] = [];
  if (keep.title.trim()) lines.push(`Title: ${keep.title.trim()}`);
  if (keep.searchPhrase.trim()) lines.push(`Search phrase: ${keep.searchPhrase.trim()}`);
  if (keep.hook.trim()) lines.push(`Hook: ${keep.hook.trim()}`);
  keep.points.forEach((p, i) => {
    if (p.text?.trim()) lines.push(`Clip ${i + 1}: ${p.text.trim()}`);
  });
  if (keep.caption.trim()) lines.push(`Caption: ${keep.caption.trim()}`);
  if (lines.length === 0) return undefined;
  return `The manager already wrote these fields. Keep them verbatim and write the rest around them.\n${lines.join('\n')}`;
}

function mergeKeep(draft: BriefDraft, keep: FillKeep): BriefDraft {
  const typedHook = keep.hook.trim();
  const points = draft.talking_points.map((p, i) => {
    const typed = keep.points[i];
    return typed?.text?.trim() ? typed : p;
  });
  for (let i = draft.talking_points.length; i < keep.points.length; i += 1) {
    const typed = keep.points[i];
    if (typed?.text?.trim()) points.push(typed);
  }
  return {
    ...draft,
    title: keep.title.trim() || draft.title,
    search_phrase: keep.searchPhrase.trim() || draft.search_phrase,
    hook_options: typedHook
      ? [typedHook, ...draft.hook_options.filter((h) => h !== typedHook)]
      : draft.hook_options,
    talking_points: points,
    caption: keep.caption.trim() || draft.caption,
  };
}

/** The reference's saved notes ride ahead of whatever the manager already typed. */
function joinContext(notes: string | null | undefined, context: string | undefined): string | undefined {
  const parts = [notes?.trim(), context?.trim()].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

async function draftFor(
  source: FillSource,
  postTypeKey: string,
  family: BriefFormat,
  context: string | undefined,
): Promise<FillResult> {
  const result =
    source.kind === 'port'
      ? await portPost({
          briefId: source.sourceBriefId,
          targetPostTypeKey: postTypeKey,
        })
      : source.kind === 'example'
        ? await generatePost({
            url: source.url,
            postTypeKey,
            family,
            context: joinContext(source.notes, context),
          })
        : source.kind === 'feature'
          ? await generatePost({ featureId: source.featureId, postTypeKey, family, context })
          : source.kind === 'media'
            ? await generatePost({ mediaId: source.mediaId, postTypeKey, family, context })
            : await generatePost({ query: source.text, postTypeKey, family, context });
  if (result.kind === 'kill') {
    return { kind: 'kill', kill_reason: result.kill_reason };
  }
  return {
    kind: 'filled',
    draft: result.draft,
    warnings: result.draft.warnings,
    placedScreenshots: 0,
  };
}

/**
 * One auto placed text box per segment the AI wrote copy for, in the company
 * theme when one is set and TikTok classic otherwise. Rows that already carry
 * boxes (survivors of a re-derive, possibly hand placed) are left alone.
 */
export async function seedOverlayBoxes(
  rows: BriefSegment[],
  themeColor: string | null,
  style: OverlayTextStyle,
): Promise<BriefSegment[]> {
  return Promise.all(
    rows.map(async (row) => {
      const text = row.overlay_text?.trim() ?? '';
      if (!row.show_on_screen || text.length === 0 || hasOverlayBoxes(row.overlay_style)) {
        return row;
      }
      const patch = serializeOverlayBoxes([
        newOverlayBox({
          id: `${row.kind}-${row.slot_index}-box-0`,
          text,
          style,
          themeColor,
        }),
      ]);
      await updateBriefSegment(row.id, patch);
      return { ...row, ...patch } as BriefSegment;
    }),
  );
}

/**
 * Pictures follow their point across a port. Storage objects are shared by
 * path, never moved: removing one post's picture only nulls its column.
 */
async function carryScreenshots(
  sourceBriefId: string,
  rows: BriefSegment[],
): Promise<void> {
  const sourceRows = await listBriefSegments(sourceBriefId);
  await Promise.all(
    rows.map(async (row) => {
      if (row.talking_point_index === null || row.screenshot_url) return;
      const from = sourceRows.find(
        (s) =>
          s.talking_point_index === row.talking_point_index && s.screenshot_url,
      );
      if (!from) return;
      await updateBriefSegment(row.id, {
        screenshot_url: from.screenshot_url,
        screenshot_x: from.screenshot_x,
        screenshot_y: from.screenshot_y,
        screenshot_width: from.screenshot_width,
      });
      row.screenshot_url = from.screenshot_url;
    }),
  );
}

const PLACE_CONCURRENCY = 3;

/**
 * Places feature screenshots from point_media onto derived rows that still
 * have no screenshot. Returns how many were placed. The editor reuses this
 * after Regenerate all. A failed row never blocks the others.
 */
export async function applyPointMedia(params: {
  companyId: string;
  briefId: string;
  rows: BriefSegment[];
  pointMedia: (PointMedia | null)[];
}): Promise<number> {
  const targets: { row: BriefSegment; media: PointMedia }[] = [];
  for (const row of params.rows) {
    if (row.talking_point_index === null || row.screenshot_url) continue;
    const media = params.pointMedia[row.talking_point_index];
    if (media && (media.library_path || media.screenshot_url)) targets.push({ row, media });
  }
  let placed = 0;
  for (let i = 0; i < targets.length; i += PLACE_CONCURRENCY) {
    const chunk = targets.slice(i, i + PLACE_CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map(async ({ row, media }) => {
        try {
          const target = {
            companyId: params.companyId,
            briefId: params.briefId,
            segmentId: row.id,
          };
          const path = media.library_path
            ? await placeLibraryItemOnSegment({
                ...target,
                item: { path: media.library_path, kind: media.library_kind ?? 'screenshot' },
              })
            : await placeRemoteImageOnSegment({ ...target, url: media.screenshot_url ?? '' });
          await updateBriefSegment(row.id, { screenshot_url: path });
          row.screenshot_url = path;
          return true;
        } catch {
          return false;
        }
      }),
    );
    placed += outcomes.filter(Boolean).length;
  }
  return placed;
}

/**
 * A typed idea the manager started a post from: saved into library_items as
 * an idea, marked used once, linked to the brief.
 */
export async function saveTypedIdea(params: {
  companyId: string;
  userId: string;
  text: string;
  briefId: string;
}): Promise<void> {
  const text = params.text.trim();
  if (!text) return;
  const row: Database['public']['Tables']['library_items']['Insert'] = {
    company_id: params.companyId,
    source: 'idea',
    text,
    created_by: params.userId,
    used_count: 1,
    last_used_at: new Date().toISOString(),
    last_brief_id: params.briefId,
  };
  const { error } = await supabase.from('library_items').insert(row);
  if (error) throw error;
}

export function familyOf(postType: PostType): BriefFormat {
  return postType.family === 'photo_carousel' ? 'photo_carousel' : 'video';
}

/**
 * The kind a week is shortest on. Each type carries a target share per week
 * (default_week_count); the one furthest below its share wins, so a week
 * does not fill up with the first type in the list. Ties fall to sort_order.
 */
export function suggestPostType(
  postTypes: PostType[],
  family: BriefFormat,
  usedTypeIds: (string | null)[],
): PostType | null {
  let best: PostType | null = null;
  let bestShare = Number.POSITIVE_INFINITY;
  for (const type of postTypes) {
    if (familyOf(type) !== family) continue;
    const used = usedTypeIds.filter((id) => id === type.id).length;
    const share = used / Math.max(1, type.default_week_count);
    if (share < bestShare) {
      best = type;
      bestShare = share;
    }
  }
  return best;
}

/** The week a manager is planning right now: the newest unpublished week, else the live one. */
export async function currentPlanningWeek(): Promise<BriefWeekSummary | null> {
  const weeks = await listBriefWeeks();
  const byDrop = (a: BriefWeekSummary, b: BriefWeekSummary) =>
    (b.campaign.drop_date ?? '') < (a.campaign.drop_date ?? '') ? -1 : 1;
  const next = weeks.filter((w) => w.status === 'next').sort(byDrop);
  if (next[0]) return next[0];
  return weeks.find((w) => w.status === 'current') ?? null;
}

/** An untouched row in a week: nothing written, not killed. */
export type EmptyWeekSlot = {
  briefId: string;
  family: BriefFormat;
  /** 1-based position inside its lane, the number the week grid shows. */
  laneIndex: number;
  postType: PostType | null;
};

export async function listEmptyWeekSlots(campaignId: string): Promise<EmptyWeekSlot[]> {
  const items = await listCampaignBriefs(campaignId);
  const laneCounts: Record<BriefFormat, number> = { video: 0, photo_carousel: 0 };
  const slots: EmptyWeekSlot[] = [];
  for (const item of items) {
    const type = item.briefs.post_types;
    const family: BriefFormat =
      (type?.family ?? item.briefs.format) === 'photo_carousel' ? 'photo_carousel' : 'video';
    laneCounts[family] += 1;
    if (item.briefs.kill_reason || briefRowState(item.briefs, type) !== 'empty') continue;
    slots.push({ briefId: item.briefs.id, family, laneIndex: laneCounts[family], postType: type });
  }
  return slots;
}

/**
 * The row a generated post lands in. An empty slot in the target lane comes
 * first so the week's targets stay honest; only a full lane grows a new row.
 */
export async function ensureSlot(params: {
  companyId: string;
  createdBy: string;
  campaignId: string | null;
  family: BriefFormat;
  postTypeId: string;
}): Promise<string> {
  if (params.campaignId) {
    const slot = await findEmptySlot({
      campaignId: params.campaignId,
      family: params.family,
      postTypeId: params.postTypeId,
    });
    if (slot) return slot.brief_id;
  }
  const brief = await createBrief({
    companyId: params.companyId,
    createdBy: params.createdBy,
    input: {
      title: '',
      format: params.family,
      hook: null,
      hook_options: [],
      talking_points: [],
      hashtags: [],
      search_phrase: null,
      point_count: null,
      target_words: 380,
      script: null,
      caption: null,
      why_it_works: null,
      cta: null,
      post_type_id: params.postTypeId,
      kill_reason: null,
      generation_id: null,
      example_url: null,
      example_transcript: null,
    },
  });
  if (params.campaignId) {
    await addBriefToCampaign({
      campaignId: params.campaignId,
      briefId: brief.id,
      companyId: params.companyId,
    });
  }
  return brief.id;
}

/**
 * Fills the slot at briefId and leaves it ready to open. The source post, if
 * there is one, is never touched.
 */
export async function fillPostSlot(params: {
  briefId: string;
  postTypeId: string;
  /** A post_types.key, or "auto" to let the model pick the kind within the lane. */
  postTypeKey: string;
  family: BriefFormat;
  source: FillSource;
  /** Needed to place feature screenshots; when omitted nothing is placed. */
  companyId?: string;
  /** Fields the manager typed before filling; they survive the fill untouched. */
  keep?: FillKeep;
}): Promise<FillResult> {
  const result = await draftFor(
    params.source,
    params.postTypeKey,
    params.family,
    params.keep ? keepContext(params.keep) : undefined,
  );
  if (result.kind === 'kill') return result;
  const draft = params.keep ? mergeKeep(result.draft, params.keep) : result.draft;
  const slideshow = params.family === 'photo_carousel';
  const postTypeId =
    params.postTypeKey === 'auto' && draft.post_type_id ? draft.post_type_id : params.postTypeId;

  await updateBrief(params.briefId, {
    title: draft.title,
    format: params.family,
    // Talking head videos get burned in captions by default; slideshows never.
    subtitles: params.family === 'video',
    // A slideshow reads its first slide instead of opening on a spoken hook,
    // and takes no spoken plug, so neither field carries across a port.
    hook: slideshow ? null : (draft.hook_options[0] ?? null),
    hook_options: slideshow ? [] : draft.hook_options,
    talking_points: draft.talking_points,
    hashtags: draft.hashtags,
    search_phrase: draft.search_phrase,
    point_count: draft.talking_points.length,
    target_words: draft.target_words,
    script: draft.script,
    caption: mergeCaption(draft.caption, draft.hashtags) || null,
    why_it_works: draft.why_it_works || null,
    cta: slideshow ? null : draft.cta,
    post_type_id: postTypeId,
    kill_reason: null,
    generation_id: draft.generation_id,
    example_url: draft.example_url || null,
    example_transcript: draft.example_transcript,
  });

  const derived = await assistDeriveSegments(params.briefId, draft.overlay_labels);
  const themeColor = await getOverlayThemeColor();
  const rows = await seedOverlayBoxes(
    derived,
    themeColor,
    resolveTextStyle(DEFAULT_TEXT_OVERLAY, themeColor),
  );
  if (params.source.kind === 'port') {
    await carryScreenshots(params.source.sourceBriefId, rows);
  }
  const placedScreenshots = params.companyId
    ? await applyPointMedia({
        companyId: params.companyId,
        briefId: params.briefId,
        rows,
        pointMedia: draft.point_media,
      })
    : 0;
  await snapshotAiFill(params.briefId, params.source.kind);
  return { ...result, placedScreenshots };
}

/**
 * Freezes the AI's version of the post so the published version can be
 * compared against it (the learning loop). Never blocks or fails a fill.
 */
async function snapshotAiFill(briefId: string, sourceKind: FillSource['kind']): Promise<void> {
  const { error } = await supabase.rpc('snapshot_ai_brief', {
    p_brief_id: briefId,
    p_source_kind: sourceKind,
  });
  if (error) console.warn('snapshot_ai_brief failed:', error.message);
}
