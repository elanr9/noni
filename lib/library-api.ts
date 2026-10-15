// Library data layer (Agent 5). One table, four source chips; "Our posts"
// reads live from posts via the library_our_posts RPC (migration 029) because
// nothing syncs posts into library_items — an our_post row is created lazily
// the first time a post is used from the picker, purely to carry
// used_count / last_used_at. Using an item marks it used, never removes it.

import { supabase } from './supabase';
import type { Database } from './types';

export type LibraryItem = Database['public']['Tables']['library_items']['Row'];
export type LibrarySource = 'idea' | 'our_post' | 'reference' | 'from_creator';

/** The slice of a ready brief the library shows before you open it. */
export type ReadyBrief = {
  id: string;
  title: string;
  hook: string | null;
  caption: string | null;
  talking_points: Database['public']['Tables']['briefs']['Row']['talking_points'];
  format: string;
  post_type_id: string | null;
  /** Set on posts in the new slides format; null on old talking points posts. */
  kind: string | null;
  slides: Database['public']['Tables']['briefs']['Row']['slides'];
  status: string;
  /** References: the one line on what structure the remix kept. */
  why_it_works: string | null;
  post_types: { key: string; label: string; family: string } | null;
};

/** An idea or reference with the AI-made posts hanging off it. */
export type LibraryItemWithBriefs = LibraryItem & {
  video_brief: ReadyBrief | null;
  carousel_brief: ReadyBrief | null;
};

const READY_BRIEF_COLUMNS =
  'id, title, hook, caption, talking_points, format, post_type_id, kind, slides, status, why_it_works, post_types(key, label, family)';

const ITEM_WITH_BRIEFS_SELECT = `*, video_brief:briefs!library_items_video_brief_id_fkey(${READY_BRIEF_COLUMNS}), carousel_brief:briefs!library_items_carousel_brief_id_fkey(${READY_BRIEF_COLUMNS})`;

/** The ready brief for a lane, when the row has one. */
export function readyBriefFor(
  item: LibraryItemWithBriefs,
  family: 'video' | 'photo_carousel',
): ReadyBrief | null {
  return family === 'photo_carousel' ? item.carousel_brief : item.video_brief;
}

export type OurPost =
  Database['public']['Functions']['library_our_posts']['Returns'][number];
export type OurPostsSort = 'top' | 'recent';

const PAGE_SIZE = 50;

/** A single-line paste that is one http(s) URL routes to a reference. */
export function isCaptureUrl(raw: string): boolean {
  const line = raw.trim();
  return /^https?:\/\/\S+$/i.test(line) && !line.includes('\n');
}

export type LibraryUsedFilter = 'new' | 'made';

/** Unused and used counts for one source, for the sub tab pills. */
export async function countLibraryItems(
  source: Exclude<LibrarySource, 'our_post'>,
): Promise<{ unused: number; used: number }> {
  const base = () =>
    supabase.from('library_items').select('id', { count: 'exact', head: true }).eq('source', source);
  const [unused, used] = await Promise.all([base().eq('used_count', 0), base().gt('used_count', 0)]);
  if (unused.error) throw unused.error;
  if (used.error) throw used.error;
  return { unused: unused.count ?? 0, used: used.count ?? 0 };
}

const FAMILY_BRIEF_COLUMN: Record<'video' | 'photo_carousel', string> = {
  video: 'video_brief_id',
  photo_carousel: 'carousel_brief_id',
};

/**
 * Which rows a family filter shows: a made reel, a made slideshow, or none
 * (the post never got made; the Library shows those with Retry in every tab).
 */
export type LibraryFamily = 'video' | 'photo_carousel' | 'none';

/** Reel, slideshow and not made counts within one used filter, from the same base as the Unused and Used pills. */
export async function countLibraryFamilies(
  source: Exclude<LibrarySource, 'our_post'>,
  used: LibraryUsedFilter,
): Promise<{ video: number; photo_carousel: number; none: number }> {
  const base = (family: LibraryFamily) => {
    let q = supabase.from('library_items').select('id', { count: 'exact', head: true }).eq('source', source);
    q = family === 'none' ? q.is('video_brief_id', null).is('carousel_brief_id', null) : q.not(FAMILY_BRIEF_COLUMN[family], 'is', null);
    return used === 'new' ? q.eq('used_count', 0) : q.gt('used_count', 0);
  };
  const [video, carousel, none] = await Promise.all([base('video'), base('photo_carousel'), base('none')]);
  if (video.error) throw video.error;
  if (carousel.error) throw carousel.error;
  if (none.error) throw none.error;
  return { video: video.count ?? 0, photo_carousel: carousel.count ?? 0, none: none.count ?? 0 };
}

export async function listLibraryItems(params: {
  source: Exclude<LibrarySource, 'our_post'>;
  search?: string;
  /** Picker filter: items of this type OR untyped (ideas carry no type). */
  postTypeId?: string;
  /** new = never made into a post, made = used at least once. */
  used?: LibraryUsedFilter;
  /** Items with a ready post in this lane, or none for the ones never made. */
  family?: LibraryFamily;
  limit?: number;
  offset?: number;
}): Promise<LibraryItemWithBriefs[]> {
  let query = supabase
    .from('library_items')
    .select(ITEM_WITH_BRIEFS_SELECT)
    .eq('source', params.source)
    .order('created_at', { ascending: false })
    .range(
      params.offset ?? 0,
      (params.offset ?? 0) + (params.limit ?? PAGE_SIZE) - 1,
    );
  const search = params.search?.trim();
  if (search) {
    query = query.or(`text.ilike.%${search}%,url.ilike.%${search}%`);
  }
  if (params.postTypeId) {
    query = query.or(
      `post_type_id.is.null,post_type_id.eq.${params.postTypeId}`,
    );
  }
  if (params.used === 'new') query = query.eq('used_count', 0);
  if (params.used === 'made') query = query.gt('used_count', 0);
  if (params.family === 'none') query = query.is('video_brief_id', null).is('carousel_brief_id', null);
  else if (params.family) query = query.not(FAMILY_BRIEF_COLUMN[params.family], 'is', null);
  const { data, error } = await query.overrideTypes<LibraryItemWithBriefs[], { merge: false }>();
  if (error) throw error;
  return data ?? [];
}

export async function getLibraryItemWithBriefs(id: string): Promise<LibraryItemWithBriefs> {
  const { data, error } = await supabase
    .from('library_items')
    .select(ITEM_WITH_BRIEFS_SELECT)
    .eq('id', id)
    .single()
    .overrideTypes<LibraryItemWithBriefs, { merge: false }>();
  if (error) throw error;
  return data;
}

/**
 * Clones a ready library brief, segments and pictures included, into an
 * empty slot. One RPC, no AI, instant. The snapshot the learning loop
 * compares against is taken on the slot afterwards.
 */
export async function copyBriefInto(params: {
  sourceBriefId: string;
  targetBriefId: string;
  sourceKind: 'idea' | 'example';
}): Promise<void> {
  const { error } = await supabase.rpc('copy_brief_into', {
    p_source_brief_id: params.sourceBriefId,
    p_target_brief_id: params.targetBriefId,
  });
  if (error) throw error;
  const snapshot = await supabase.rpc('snapshot_ai_brief', {
    p_brief_id: params.targetBriefId,
    p_source_kind: params.sourceKind,
  });
  if (snapshot.error) console.warn('snapshot_ai_brief failed:', snapshot.error.message);
}

export async function updateLibraryItemText(id: string, text: string): Promise<void> {
  const { error } = await supabase
    .from('library_items')
    .update({ text: text.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const { error } = await supabase.from('library_items').delete().eq('id', id);
  if (error) throw error;
}

export async function listOurPosts(params: {
  days?: number | null;
  creatorId?: string;
  postTypeId?: string;
  search?: string;
  sort?: OurPostsSort;
  limit?: number;
  offset?: number;
}): Promise<OurPost[]> {
  const { data, error } = await supabase.rpc('library_our_posts', {
    p_days: params.days === null ? undefined : (params.days ?? 60),
    p_creator_id: params.creatorId,
    p_post_type_id: params.postTypeId,
    p_search: params.search?.trim() || undefined,
    p_sort: params.sort ?? 'top',
    p_limit: params.limit ?? PAGE_SIZE,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  return data ?? [];
}

type LinkPreview = { thumbnail_url?: string | null; title?: string | null };

async function resolveLinkPreview(url: string): Promise<LinkPreview | null> {
  const { data } = await supabase.functions.invoke('library-link', { body: { url } });
  return (data as LinkPreview | null) ?? null;
}

export async function enrichReference(itemId: string, url: string): Promise<void> {
  try {
    const preview = await resolveLinkPreview(url);
    if (!preview?.thumbnail_url && !preview?.title) return;
    await supabase
      .from('library_items')
      .update({
        thumbnail_url: preview.thumbnail_url ?? null,
        ...(preview.title ? { text: preview.title } : {}),
      })
      .eq('id', itemId);
  } catch {
    // Best effort; the reference row already exists.
  }
}

/**
 * Our posts have no library_items row until something needs one (a use, a
 * thumbnail). Find by post_id, else insert with used_count 0.
 */
async function findOrCreateOurPostItem(
  companyId: string,
  userId: string,
  post: OurPost,
): Promise<LibraryItem> {
  if (post.library_item_id) {
    const { data, error } = await supabase
      .from('library_items')
      .select('*')
      .eq('id', post.library_item_id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  const { data: existing, error: findError } = await supabase
    .from('library_items')
    .select('*')
    .eq('source', 'our_post')
    .eq('post_id', post.post_id)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('library_items')
    .insert({
      company_id: companyId,
      source: 'our_post',
      post_id: post.post_id,
      creator_id: post.creator_id,
      post_type_id: post.post_type_id,
      text: post.title ?? post.hook,
      url: post.post_url,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Resolve a thumbnail for one of our posts through the same edge function
 * references use, storing it on the our_post library row. Returns the URL
 * that landed, or null when nothing resolved.
 */
export async function enrichOurPostThumbnail(
  companyId: string,
  userId: string,
  post: OurPost,
): Promise<string | null> {
  if (!post.post_url) return null;
  const item = await findOrCreateOurPostItem(companyId, userId, post);
  if (item.thumbnail_url) return item.thumbnail_url;
  const preview = await resolveLinkPreview(post.post_url);
  if (!preview?.thumbnail_url) return null;
  const { error } = await supabase
    .from('library_items')
    .update({ thumbnail_url: preview.thumbnail_url })
    .eq('id', item.id);
  if (error) throw error;
  return preview.thumbnail_url;
}

/** Creator filter options for the Our posts chip; lighter than the leaderboard. */
export async function listCreatorOptions(
  companyId: string,
): Promise<{ id: string; full_name: string | null }[]> {
  const { data, error } = await supabase
    .from('company_roster')
    .select('id, full_name')
    .eq('company_id', companyId)
    .or('member_role.eq.creator,can_create.eq.true')
    .order('full_name');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id ?? '', full_name: p.full_name }));
}

/** Increment usage and remember the post it became; never deletes. */
export async function markLibraryItemUsed(
  item: LibraryItem,
  briefId?: string,
): Promise<void> {
  const { error } = await supabase
    .from('library_items')
    .update({
      used_count: item.used_count + 1,
      last_used_at: new Date().toISOString(),
      ...(briefId ? { last_brief_id: briefId } : {}),
    })
    .eq('id', item.id);
  if (error) throw error;
}

/** Our posts: find or create the our_post row by post_id, then increment. */
export async function markOurPostUsed(
  companyId: string,
  userId: string,
  post: OurPost,
  briefId?: string,
): Promise<void> {
  const item = await findOrCreateOurPostItem(companyId, userId, post);
  await markLibraryItemUsed(item, briefId);
}

// ---------------------------------------------------------------------------
// Library features for the briefs redesign. A feature is a product_features
// row; the CTA slide of a brief picks one, and the General row is the fallback.
//
// The pictures behind a feature: its own clip_url / screenshot_url when set
// (a brief-assets storage path or a full URL), else the manager's named
// recordings and screenshots in media_library matched to the feature by name.
// Everything a view draws is a signed or public URL, never a storage path.

export type ProductFeatureRow = Database['public']['Tables']['product_features']['Row'];
type MediaLibraryRow = Database['public']['Tables']['media_library']['Row'];

/** A screen recording ready to play: signed URL, poster when one was saved. */
export type FeatureClip = {
  url: string;
  posterUrl: string | null;
  durationMs: number | null;
  /** width / height when known; phone recordings are about 0.46. */
  aspect: number | null;
};

/** A still ready to draw. */
export type FeatureStill = { url: string; aspect: number | null };

export type FeatureMedia = { clip: FeatureClip | null; still: FeatureStill | null };

export type LibraryFeature = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  /** The plug line a creator says or writes on the CTA slide. */
  cta: string;
  /** Playable URL once loaded through listLibraryFeatures; the raw column otherwise. */
  clipUrl: string | null;
  /** Viewable URL once loaded through listLibraryFeatures; the raw column otherwise. */
  screenshotUrl: string | null;
  isGeneral: boolean;
  /** Resolved media; absent on rows that never went through the loaders. */
  media?: FeatureMedia | null;
  /** The same media as brief-assets storage paths (null for outside URLs), for the render. */
  mediaPaths?: { clip: string | null; still: string | null };
};

/** Pure: a product_features row to the shape the brief editor shows. */
export function libraryFeatureFromRow(row: ProductFeatureRow): LibraryFeature {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.name,
    description: row.what_it_does,
    cta: row.claim,
    clipUrl: row.clip_url,
    screenshotUrl: row.screenshot_url,
    isGeneral: row.is_general,
  };
}

/** Pure: General first, then by title. */
export function sortLibraryFeatures(features: LibraryFeature[]): LibraryFeature[] {
  return [...features].sort((a, b) => {
    if (a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

const FEATURE_MEDIA_BUCKET = 'brief-assets';
const FEATURE_MEDIA_TTL_S = 6 * 3600;
const FEATURE_VIDEO = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

export type FeatureMediaRow = Pick<
  MediaLibraryRow,
  'id' | 'kind' | 'path' | 'thumb_path' | 'title' | 'description' | 'duration_ms' | 'width' | 'height' | 'created_at'
>;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'with', 'by', 'from', 'it', 'is', 'are', 'be',
  'you', 'your', 'my', 'me', 'we', 'our', 'that', 'this', 'one', 'all', 'every', 'when', 'what', 'can', 'get',
  'screen', 'recording', 'screenshot', 'shot', 'clip', 'new', 'final', 'copy', 'img', 'image',
]);
const TOKEN_ALIASES: Record<string, string> = { hl: 'highlight', hls: 'highlight', msg: 'message', msgs: 'message', dm: 'message', dms: 'message', emails: 'email', mail: 'email' };

/** Pure: comparable words of a title or description (lowercase, singular, aliases expanded). */
export function featureTokens(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of (text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
    const aliased = TOKEN_ALIASES[raw] ?? raw;
    out.add(aliased.length > 3 && aliased.endsWith('s') && !aliased.endsWith('ss') ? aliased.slice(0, -1) : aliased);
  }
  return out;
}

/**
 * Pure: the best named recording and screenshot in the media library for
 * each feature. Words shared by the two titles count most, words the other
 * side's description mentions count a little, and a word that names many
 * files counts less. The General feature falls back to the newest file of
 * each kind; any other feature with no fitting file gets none.
 */
export function matchFeatureMedia(
  features: Pick<LibraryFeature, 'id' | 'title' | 'description' | 'isGeneral'>[],
  rows: FeatureMediaRow[],
): Map<string, { recording: FeatureMediaRow | null; screenshot: FeatureMediaRow | null }> {
  const newestFirst = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const media = newestFirst.map((row) => ({ row, title: featureTokens(row.title), desc: featureTokens(row.description) }));
  const df = new Map<string, number>();
  for (const m of media) for (const t of m.title) df.set(t, (df.get(t) ?? 0) + 1);
  const weight = (t: string) => 1 / Math.max(1, df.get(t) ?? 1);

  const out = new Map<string, { recording: FeatureMediaRow | null; screenshot: FeatureMediaRow | null }>();
  for (const f of features) {
    const fTitle = featureTokens(f.title);
    const fDesc = featureTokens(f.description);
    const best: Record<'recording' | 'screenshot', { row: FeatureMediaRow; score: number } | null> = { recording: null, screenshot: null };
    for (const m of media) {
      if (!m.title.size) continue;
      let score = 0;
      for (const t of m.title) {
        if (fTitle.has(t)) score += 3 * weight(t);
        else if (fDesc.has(t)) score += weight(t);
      }
      for (const t of fTitle) if (!m.title.has(t) && m.desc.has(t)) score += weight(t);
      if (score < 1) continue;
      const kind = m.row.kind === 'recording' ? 'recording' : 'screenshot';
      const cur = best[kind];
      if (!cur || score > cur.score) best[kind] = { row: m.row, score };
    }
    const newest = (kind: string) => newestFirst.find((r) => (r.kind === 'recording') === (kind === 'recording')) ?? null;
    out.set(f.id, {
      recording: best.recording?.row ?? (f.isGeneral ? newest('recording') : null),
      screenshot: best.screenshot?.row ?? (f.isGeneral ? newest('screenshot') : null),
    });
  }
  return out;
}

const aspectOf = (w: number | null, h: number | null): number | null => (w && h && w > 0 && h > 0 ? w / h : null);

/**
 * Fills media, clipUrl and screenshotUrl with drawable URLs. Never throws:
 * a feature whose files cannot be read keeps its raw columns and draws the
 * no media card.
 */
async function withFeatureMedia(features: LibraryFeature[]): Promise<LibraryFeature[]> {
  if (features.length === 0) return features;
  try {
    const companyIds = [...new Set(features.map((f) => f.companyId))];
    const { data: rows } = await supabase
      .from('media_library')
      .select('id, kind, path, thumb_path, title, description, duration_ms, width, height, created_at')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false });
    const library = (rows ?? []) as FeatureMediaRow[];
    const matches = matchFeatureMedia(features, library);

    const isUrl = (v: string) => /^https?:/i.test(v);
    const paths = new Set<string>();
    for (const f of features) {
      for (const v of [f.clipUrl, f.screenshotUrl]) if (v && !isUrl(v)) paths.add(v);
      const m = matches.get(f.id);
      for (const r of [m?.recording, m?.screenshot]) {
        if (r) paths.add(r.path);
        if (r?.thumb_path) paths.add(r.thumb_path);
      }
    }
    const signed = new Map<string, string>();
    if (paths.size) {
      const { data } = await supabase.storage.from(FEATURE_MEDIA_BUCKET).createSignedUrls([...paths], FEATURE_MEDIA_TTL_S);
      for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) signed.set(s.path, s.signedUrl);
    }
    const url = (v: string | null | undefined) => (!v ? null : isUrl(v) ? v : (signed.get(v) ?? null));

    return features.map((f) => {
      const m = matches.get(f.id);
      // A video saved in screenshot_url is a clip, not a still.
      const ownClip = url(f.clipUrl) ?? (f.screenshotUrl && FEATURE_VIDEO.test(f.screenshotUrl) ? url(f.screenshotUrl) : null);
      const ownStill = f.screenshotUrl && !FEATURE_VIDEO.test(f.screenshotUrl) ? url(f.screenshotUrl) : null;
      const rec = m?.recording ?? null;
      const shot = m?.screenshot ?? null;
      const clip: FeatureClip | null = ownClip
        ? { url: ownClip, posterUrl: null, durationMs: null, aspect: null }
        : rec && url(rec.path)
          ? { url: url(rec.path)!, posterUrl: url(rec.thumb_path), durationMs: rec.duration_ms, aspect: aspectOf(rec.width, rec.height) }
          : null;
      const still: FeatureStill | null = ownStill
        ? { url: ownStill, aspect: null }
        : shot && url(shot.path)
          ? { url: url(shot.path)!, aspect: aspectOf(shot.width, shot.height) }
          : null;
      const ownClipPath = f.clipUrl && !isUrl(f.clipUrl) ? f.clipUrl : f.screenshotUrl && FEATURE_VIDEO.test(f.screenshotUrl) && !isUrl(f.screenshotUrl) ? f.screenshotUrl : null;
      const ownStillPath = f.screenshotUrl && !FEATURE_VIDEO.test(f.screenshotUrl) && !isUrl(f.screenshotUrl) ? f.screenshotUrl : null;
      const clipPath = ownClip ? ownClipPath : (rec?.path ?? null);
      const stillPath = ownStill ? ownStillPath : (shot?.path ?? null);
      return {
        ...f,
        clipUrl: clip?.url ?? null,
        screenshotUrl: still?.url ?? null,
        media: clip || still ? { clip, still } : null,
        mediaPaths: { clip: clip ? clipPath : null, still: still ? stillPath : null },
      };
    });
  } catch (e) {
    console.warn('feature media failed to load', e);
    return features;
  }
}

export async function listLibraryFeatures(companyId: string): Promise<LibraryFeature[]> {
  const { data, error } = await supabase
    .from('product_features')
    .select('*')
    .eq('company_id', companyId)
    .eq('approved', true)
    .eq('rejected', false);
  if (error) throw error;
  return withFeatureMedia(sortLibraryFeatures((data ?? []).map(libraryFeatureFromRow)));
}

export async function getLibraryFeature(id: string): Promise<LibraryFeature | null> {
  const { data, error } = await supabase.from('product_features').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? ((await withFeatureMedia([libraryFeatureFromRow(data)]))[0] ?? null) : null;
}

/** The company's General feature, used when no feature fits the post. */
export async function getGeneralFeature(companyId: string): Promise<LibraryFeature | null> {
  const { data, error } = await supabase
    .from('product_features')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_general', true)
    .maybeSingle();
  if (error) throw error;
  return data ? ((await withFeatureMedia([libraryFeatureFromRow(data)]))[0] ?? null) : null;
}

/** Pure: pick the feature a CTA should plug, by id, else General, else the first one. */
export function pickFeature(
  features: LibraryFeature[],
  featureId: string | null | undefined,
): LibraryFeature | null {
  if (featureId) {
    const exact = features.find((f) => f.id === featureId);
    if (exact) return exact;
  }
  return features.find((f) => f.isGeneral) ?? features[0] ?? null;
}
