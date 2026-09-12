// Capturing an idea or a reference in the Library makes the post right then,
// through the same fill the week grid and the editor use, into a brief that
// belongs to no week. The library row keeps one ready brief per lane so an
// empty slot can be filled from it later without touching the AI again.

import type { BriefFormat, PostType } from './briefs-api';
import {
  enrichReference,
  getLibraryItemWithBriefs,
  readyBriefFor,
  type LibraryItem,
  type LibraryItemWithBriefs,
} from './library-api';
import { ensureSlot, fillPostSlot, type FillSource } from './post-fill';
import { supabase } from './supabase';

export type LibraryMakeSource =
  | { kind: 'idea'; text: string }
  | { kind: 'reference'; url: string; notes?: string | null };

export type LibraryMakeOutcome = {
  item: LibraryItem;
  made: BriefFormat[];
  killed: { family: BriefFormat; reason: string }[];
};

/** The company's lead type for a lane: first by sort_order. */
export function defaultPostTypeFor(postTypes: PostType[], family: BriefFormat): PostType | null {
  return (
    postTypes.find(
      (t) => (t.family === 'photo_carousel' ? 'photo_carousel' : 'video') === family,
    ) ?? null
  );
}

function fillSourceOf(source: LibraryMakeSource): FillSource {
  return source.kind === 'idea'
    ? { kind: 'idea', text: source.text }
    : { kind: 'example', url: source.url, notes: source.notes ?? null };
}

async function insertItem(
  companyId: string,
  userId: string,
  source: LibraryMakeSource,
): Promise<LibraryItem> {
  const { data, error } = await supabase
    .from('library_items')
    .insert(
      source.kind === 'idea'
        ? { company_id: companyId, source: 'idea', text: source.text, created_by: userId }
        : {
            company_id: companyId,
            source: 'reference',
            url: source.url,
            notes: source.notes?.trim() || null,
            created_by: userId,
          },
    )
    .select('*')
    .single();
  if (error) throw error;
  if (source.kind === 'reference') void enrichReference(data.id, source.url);
  return data;
}

async function makeOne(params: {
  companyId: string;
  userId: string;
  item: LibraryItem;
  source: FillSource;
  family: BriefFormat;
  /** The fallback kind; with autoType the model picks the kind from the source. */
  postType: PostType;
  autoType?: boolean;
}): Promise<{ briefId: string } | { kill: string }> {
  const briefId = await ensureSlot({
    companyId: params.companyId,
    createdBy: params.userId,
    campaignId: null,
    family: params.family,
    postTypeId: params.postType.id,
  });
  const tagged = await supabase
    .from('briefs')
    .update({ library_item_id: params.item.id })
    .eq('id', briefId);
  if (tagged.error) throw tagged.error;

  const result = await fillPostSlot({
    briefId,
    postTypeId: params.postType.id,
    postTypeKey: params.autoType ? 'auto' : params.postType.key,
    family: params.family,
    source: params.source,
    companyId: params.companyId,
  });
  if (result.kind === 'kill') {
    await supabase.from('briefs').delete().eq('id', briefId);
    return { kill: result.kill_reason };
  }
  return { briefId };
}

/**
 * A ready reel becomes a ready slideshow, or the reverse, by porting the
 * existing brief into a new one that belongs to no week. Returns the patched
 * library row, or the reason the AI refused.
 */
export async function makeOtherFormat(params: {
  companyId: string;
  userId: string;
  item: LibraryItemWithBriefs;
  family: BriefFormat;
  postTypes: PostType[];
}): Promise<{ item: LibraryItemWithBriefs } | { kill: string }> {
  const other = readyBriefFor(params.item, params.family === 'video' ? 'photo_carousel' : 'video');
  if (!other) throw new Error('Nothing to port from yet.');
  const postType = defaultPostTypeFor(params.postTypes, params.family);
  if (!postType) {
    throw new Error(
      params.family === 'photo_carousel'
        ? 'No slideshow post type is set up yet.'
        : 'No video post type is set up yet.',
    );
  }
  const made = await makeOne({
    companyId: params.companyId,
    userId: params.userId,
    item: params.item,
    source: { kind: 'port', sourceBriefId: other.id },
    family: params.family,
    postType,
  });
  if ('kill' in made) return made;
  const { error } = await supabase
    .from('library_items')
    .update(
      params.family === 'photo_carousel'
        ? { carousel_brief_id: made.briefId }
        : { video_brief_id: made.briefId },
    )
    .eq('id', params.item.id);
  if (error) throw error;
  return { item: await getLibraryItemWithBriefs(params.item.id) };
}

/**
 * Saves the row, then makes one ready post per requested lane in parallel.
 * The model picks the kind of post from the idea itself, so a list idea
 * becomes a list and a one line truth becomes a 7 second video. A lane the
 * AI refuses is reported, not saved. When every lane is refused the row is
 * removed again so the library never shows an empty idea.
 */
export async function makeLibraryPosts(params: {
  companyId: string;
  userId: string;
  source: LibraryMakeSource;
  families: BriefFormat[];
  postTypes: PostType[];
}): Promise<LibraryMakeOutcome> {
  const lanes = params.families.map((family) => ({
    family,
    postType: defaultPostTypeFor(params.postTypes, family),
  }));
  const missing = lanes.find((lane) => lane.postType === null);
  if (missing) {
    throw new Error(
      missing.family === 'photo_carousel'
        ? 'No slideshow post type is set up yet.'
        : 'No video post type is set up yet.',
    );
  }

  const item = await insertItem(params.companyId, params.userId, params.source);

  const outcomes = await Promise.all(
    lanes.map(async (lane) => {
      if (!lane.postType) throw new Error('unreachable');
      try {
        const made = await makeOne({
          companyId: params.companyId,
          userId: params.userId,
          item,
          source: fillSourceOf(params.source),
          family: lane.family,
          postType: lane.postType,
          autoType: true,
        });
        return { family: lane.family, ...made };
      } catch (e) {
        return { family: lane.family, kill: e instanceof Error ? e.message : 'Could not make it' };
      }
    }),
  );

  const made: BriefFormat[] = [];
  const killed: LibraryMakeOutcome['killed'] = [];
  const patch: { video_brief_id?: string; carousel_brief_id?: string } = {};
  for (const outcome of outcomes) {
    if ('briefId' in outcome) {
      made.push(outcome.family);
      if (outcome.family === 'photo_carousel') patch.carousel_brief_id = outcome.briefId;
      else patch.video_brief_id = outcome.briefId;
    } else {
      killed.push({ family: outcome.family, reason: outcome.kill });
    }
  }

  if (made.length === 0) {
    await supabase.from('library_items').delete().eq('id', item.id);
    return { item, made, killed };
  }

  const { data, error } = await supabase
    .from('library_items')
    .update(patch)
    .eq('id', item.id)
    .select('*')
    .single();
  if (error) throw error;
  return { item: data, made, killed };
}
