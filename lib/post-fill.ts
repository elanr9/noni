// Filling an empty post slot from AI. The editor, the week grid and the
// Library tab all fill the same way, so the sequence lives here once: draft,
// write it into the slot, derive the render manifest, seed the slide text
// boxes, then carry the source post's pictures across.

import {
  addBriefToCampaign,
  assistDeriveSegments,
  briefRowState,
  createBrief,
  findEmptySlot,
  generatePost,
  getOverlayThemeColor,
  listBriefSegments,
  listBriefWeeks,
  listCampaignBriefs,
  portPost,
  updateBrief,
  updateBriefSegment,
  type BriefDraft,
  type BriefFormat,
  type BriefSegment,
  type BriefWeekSummary,
  type PointMedia,
  type PostType,
} from './briefs-api';
import { placeRemoteImageOnSegment } from './media-library-api';
import {
  hasOverlayBoxes,
  newOverlayBox,
  serializeOverlayBoxes,
} from './overlay-boxes';
import { supabase } from './supabase';
import type { Database } from './types';

/** Where the new post comes from. A port reads a finished post in this company. */
export type FillSource =
  | { kind: 'port'; sourceBriefId: string }
  | { kind: 'example'; url: string }
  | { kind: 'idea'; text: string }
  | { kind: 'feature'; featureId: string };

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

async function draftFor(
  source: FillSource,
  postTypeKey: string,
): Promise<FillResult> {
  const result =
    source.kind === 'port'
      ? await portPost({
          briefId: source.sourceBriefId,
          targetPostTypeKey: postTypeKey,
        })
      : source.kind === 'example'
        ? await generatePost({ url: source.url, postTypeKey })
        : source.kind === 'feature'
          ? await generatePost({ featureId: source.featureId, postTypeKey })
          : await generatePost({ query: source.text, postTypeKey });
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
          style: themeColor ? 'theme' : 'classic',
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
  const targets: { row: BriefSegment; url: string }[] = [];
  for (const row of params.rows) {
    if (row.talking_point_index === null || row.screenshot_url) continue;
    const url = params.pointMedia[row.talking_point_index]?.screenshot_url;
    if (url) targets.push({ row, url });
  }
  let placed = 0;
  for (let i = 0; i < targets.length; i += PLACE_CONCURRENCY) {
    const chunk = targets.slice(i, i + PLACE_CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map(async ({ row, url }) => {
        try {
          const path = await placeRemoteImageOnSegment({
            companyId: params.companyId,
            briefId: params.briefId,
            segmentId: row.id,
            url,
          });
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
  postTypeKey: string;
  family: BriefFormat;
  source: FillSource;
  /** Needed to place feature screenshots; when omitted nothing is placed. */
  companyId?: string;
}): Promise<FillResult> {
  const result = await draftFor(params.source, params.postTypeKey);
  if (result.kind === 'kill') return result;
  const { draft } = result;
  const slideshow = params.family === 'photo_carousel';

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
    post_type_id: params.postTypeId,
    kill_reason: null,
    generation_id: draft.generation_id,
    example_url: draft.example_url || null,
    example_transcript: draft.example_transcript,
  });

  const derived = await assistDeriveSegments(params.briefId, draft.overlay_labels);
  const rows = await seedOverlayBoxes(derived, await getOverlayThemeColor());
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
