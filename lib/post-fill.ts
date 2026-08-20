// Filling an empty post slot from AI. The editor, the week grid and the
// Library tab all fill the same way, so the sequence lives here once: draft,
// write it into the slot, derive the render manifest, seed the slide text
// boxes, then carry the source post's pictures across.

import {
  addBriefToCampaign,
  assistDeriveSegments,
  createBrief,
  findEmptySlot,
  generatePost,
  listBriefSegments,
  portPost,
  updateBrief,
  updateBriefSegment,
  type BriefDraft,
  type BriefFormat,
  type BriefSegment,
} from './briefs-api';
import {
  DEFAULT_BOX_SIZE,
  DEFAULT_OVERLAY_FILL,
  DEFAULT_TEXT_Y,
  serializeOverlayBoxes,
} from './overlay-boxes';

/** Where the new post comes from. A port reads a finished post in this company. */
export type FillSource =
  | { kind: 'port'; sourceBriefId: string }
  | { kind: 'example'; url: string }
  | { kind: 'idea'; text: string };

export type FillResult =
  | { kind: 'filled'; draft: BriefDraft; warnings: string[] }
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
        : await generatePost({ query: source.text, postTypeKey });
  if (result.kind === 'kill') {
    return { kind: 'kill', kill_reason: result.kill_reason };
  }
  return { kind: 'filled', draft: result.draft, warnings: result.draft.warnings };
}

/** One text box per slide, matching what a slideshow "Regenerate all" writes. */
async function seedSlideText(
  rows: BriefSegment[],
  draft: BriefDraft,
): Promise<void> {
  await Promise.all(
    rows.map(async (row) => {
      if (row.kind !== 'slide' || row.talking_point_index === null) return;
      const text = draft.talking_points[row.talking_point_index]?.text?.trim() ?? '';
      await updateBriefSegment(
        row.id,
        serializeOverlayBoxes(
          text
            ? [
                {
                  id: `slide-${row.talking_point_index}-box-0`,
                  text,
                  color: DEFAULT_OVERLAY_FILL,
                  bg: true,
                  size: DEFAULT_BOX_SIZE,
                  x: 0.5,
                  y: DEFAULT_TEXT_Y,
                },
              ]
            : [],
        ),
      );
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
    }),
  );
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
}): Promise<FillResult> {
  const result = await draftFor(params.source, params.postTypeKey);
  if (result.kind === 'kill') return result;
  const { draft } = result;
  const slideshow = params.family === 'photo_carousel';

  await updateBrief(params.briefId, {
    title: draft.title,
    format: params.family,
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

  const rows = await assistDeriveSegments(params.briefId, draft.overlay_labels);
  if (slideshow) await seedSlideText(rows, draft);
  if (params.source.kind === 'port') {
    await carryScreenshots(params.source.sourceBriefId, rows);
  }
  return result;
}
