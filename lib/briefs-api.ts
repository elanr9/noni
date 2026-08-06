// Admin Create data layer: briefs and campaign_briefs CRUD plus publish.
// Everything is company_id scoped by RLS; writes are admin-only by policy.
// Assignment status never changes here; that stays in lib/tasks-api.ts.

import {
  runTier1Checks,
  type PostTypeShape,
  type ReviewCheck,
  type TalkingPoint,
} from '../supabase/functions/_shared/validateBrief';
import { supabase } from './supabase';
import type { Database, Json } from './types';

export type { PostTypeShape, ReviewCheck, TalkingPoint };

export type Brief = Database['public']['Tables']['briefs']['Row'];
export type Campaign = Database['public']['Tables']['campaigns']['Row'];
export type CampaignBrief = Database['public']['Tables']['campaign_briefs']['Row'];
export type PostType = Database['public']['Tables']['post_types']['Row'];
export type BriefSegment = Database['public']['Tables']['brief_segments']['Row'];

export type BriefFormat = 'video' | 'photo_carousel';

export type BriefDraft = {
  title: string;
  format: BriefFormat;
  hook_options: string[];
  talking_points: TalkingPoint[];
  hashtags: string[];
  search_phrase: string | null;
  point_count: number | null;
  target_words: number;
  script: string | null;
  caption: string;
  why_it_works: string;
  cta: string | null;
  post_type_id: string | null;
  overlay_labels: (string | null)[];
  generation_id: string | null;
  warnings: string[];
  example_url: string;
  example_transcript: string | null;
};

export type BriefInput = {
  title: string;
  format: BriefFormat;
  hook: string | null;
  hook_options: string[];
  talking_points: TalkingPoint[];
  hashtags: string[];
  search_phrase: string | null;
  point_count: number | null;
  target_words: number;
  script: string | null;
  caption: string | null;
  why_it_works: string | null;
  cta: string | null;
  post_type_id: string | null;
  kill_reason: string | null;
  generation_id: string | null;
  example_url: string | null;
  example_transcript: string | null;
};

export type BriefWithType = Brief & { post_types: PostType | null };
export type CampaignBriefItem = CampaignBrief & { briefs: BriefWithType };

/** Reads the talking_points jsonb column back into typed points. */
export function parseTalkingPoints(value: Json): TalkingPoint[] {
  if (!Array.isArray(value)) return [];
  const points: TalkingPoint[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    points.push({
      id: typeof raw.id === 'string' ? raw.id : String(points.length + 1),
      text: typeof raw.text === 'string' ? raw.text : null,
      is_product: raw.is_product === true,
      edited_by_admin: raw.edited_by_admin === true,
      claim_id: typeof raw.claim_id === 'string' ? raw.claim_id : null,
    });
  }
  return points;
}

/** Reads the hook_options jsonb column back into strings. */
export function parseHookOptions(value: Json): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export type SearchQuery = Database['public']['Tables']['search_queries']['Row'];

export type GeneratePostResult =
  | { kind: 'draft'; draft: BriefDraft }
  | { kind: 'kill'; kill_reason: string; generation_id: string | null };

type RawDraftResponse = Partial<BriefDraft> & {
  error?: string;
  kill_reason?: string;
};

/**
 * Fill a post through the deployed ingest-brief function. Exactly one of
 * query or url. A kill is a first-class outcome, never an exception: the
 * caller persists kill_reason on the brief so the slot renders empty with
 * the reason. Nothing is saved here.
 */
export async function generatePost(params: {
  query?: string;
  url?: string;
  postTypeKey?: string;
  context?: string;
}): Promise<GeneratePostResult> {
  const body: Record<string, string> = {};
  if (params.query?.trim()) body.query = params.query.trim();
  if (params.url?.trim()) body.url = params.url.trim();
  if (params.postTypeKey) body.post_type = params.postTypeKey;
  if (params.context?.trim()) body.context = params.context.trim();
  const { data, error } = await supabase.functions.invoke('ingest-brief', {
    body,
  });
  if (error) throw error;
  const raw = data as RawDraftResponse;
  if (raw.error) throw new Error(raw.error);
  if (raw.kill_reason) {
    return {
      kind: 'kill',
      kill_reason: raw.kill_reason,
      generation_id: raw.generation_id ?? null,
    };
  }
  if (!raw.title) throw new Error('Draft came back incomplete');
  const format: BriefFormat =
    raw.format === 'photo_carousel' ? 'photo_carousel' : 'video';
  return {
    kind: 'draft',
    draft: {
      title: raw.title,
      format,
      hook_options: raw.hook_options ?? [],
      talking_points: raw.talking_points ?? [],
      hashtags: raw.hashtags ?? [],
      search_phrase: raw.search_phrase ?? null,
      point_count: raw.point_count ?? null,
      target_words: raw.target_words ?? 380,
      script: raw.script ?? null,
      caption: raw.caption ?? '',
      why_it_works: raw.why_it_works ?? '',
      cta: raw.cta ?? null,
      post_type_id: raw.post_type_id ?? null,
      overlay_labels: raw.overlay_labels ?? [],
      generation_id: raw.generation_id ?? null,
      warnings: raw.warnings ?? [],
      example_url: raw.example_url ?? params.url ?? '',
      example_transcript: raw.example_transcript ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// brief-assist: per-field regeneration and segment derivation

export type RegenField =
  | 'search_phrase'
  | 'talking_points'
  | 'talking_point'
  | 'hook'
  | 'caption';

/** The editor's current state, sent as context. Nothing is saved. */
export type RegenDraftPayload = {
  title: string;
  search_phrase: string | null;
  format: BriefFormat;
  point_count: number;
  target_words: number;
  hook_options: string[];
  talking_points: TalkingPoint[];
  cta: string | null;
  caption: string;
  hashtags: string[];
  why_it_works: string;
  script: string | null;
};

export type RegenResult =
  | { kind: 'kill'; kill_reason: string }
  | { kind: 'search_phrase'; search_phrase: string | null; warnings: string[] }
  | {
      kind: 'talking_points';
      talking_points: TalkingPoint[];
      cta: string | null;
      point_count: number | null;
      script: string | null;
      target_words: number | null;
      overlay_labels: (string | null)[];
      hook_may_be_stale: boolean;
      warnings: string[];
    }
  | {
      kind: 'talking_point';
      talking_point: TalkingPoint;
      overlay_label: string | null;
      index: number;
      hook_may_be_stale: boolean;
      warnings: string[];
    }
  | { kind: 'hook'; hook_options: string[]; warnings: string[] }
  | { kind: 'caption'; caption: string; hashtags: string[]; warnings: string[] };

export async function assistRegenerateField(params: {
  field: RegenField;
  draft: RegenDraftPayload;
  postTypeKey?: string;
  index?: number;
}): Promise<RegenResult> {
  const { data, error } = await supabase.functions.invoke('brief-assist', {
    body: {
      action: 'regenerate_field',
      field: params.field,
      draft: params.draft,
      post_type: params.postTypeKey,
      index: params.index,
    },
  });
  if (error) throw error;
  const raw = data as Record<string, unknown> & { error?: string };
  if (raw.error) throw new Error(raw.error);
  if (typeof raw.kill_reason === 'string') {
    return { kind: 'kill', kill_reason: raw.kill_reason };
  }
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  switch (params.field) {
    case 'search_phrase':
      return {
        kind: 'search_phrase',
        search_phrase:
          typeof raw.search_phrase === 'string' ? raw.search_phrase : null,
        warnings,
      };
    case 'talking_points':
      return {
        kind: 'talking_points',
        talking_points: parseTalkingPoints(raw.talking_points as Json),
        cta: typeof raw.cta === 'string' ? raw.cta : null,
        point_count:
          typeof raw.point_count === 'number' ? raw.point_count : null,
        script: typeof raw.script === 'string' ? raw.script : null,
        target_words:
          typeof raw.target_words === 'number' ? raw.target_words : null,
        overlay_labels: Array.isArray(raw.overlay_labels)
          ? raw.overlay_labels.map((l) => (typeof l === 'string' ? l : null))
          : [],
        hook_may_be_stale: raw.hook_may_be_stale === true,
        warnings,
      };
    case 'talking_point': {
      const point = parseTalkingPoints([raw.talking_point] as Json)[0];
      if (!point) throw new Error('Regeneration came back empty');
      return {
        kind: 'talking_point',
        talking_point: point,
        overlay_label:
          typeof raw.overlay_label === 'string' ? raw.overlay_label : null,
        index: typeof raw.index === 'number' ? raw.index : params.index ?? 0,
        hook_may_be_stale: raw.hook_may_be_stale === true,
        warnings,
      };
    }
    case 'hook':
      return {
        kind: 'hook',
        hook_options: parseHookOptions(raw.hook_options as Json),
        warnings,
      };
    case 'caption':
      return {
        kind: 'caption',
        caption: typeof raw.caption === 'string' ? raw.caption : '',
        hashtags: Array.isArray(raw.hashtags)
          ? raw.hashtags.filter((h): h is string => typeof h === 'string')
          : [],
        warnings,
      };
  }
}

/**
 * Derive or re-derive brief_segments for a SAVED brief through the
 * sync_brief_segments RPC. Call after createBrief/save and after any edit
 * that changes points, hook, or type. Surviving rows keep their
 * overlay_text, show_on_screen and screenshot_url; never push those
 * through this call.
 */
export async function assistDeriveSegments(
  briefId: string,
  overlayLabels?: (string | null)[],
): Promise<BriefSegment[]> {
  const { data, error } = await supabase.functions.invoke('brief-assist', {
    body: {
      action: 'derive_segments',
      brief_id: briefId,
      overlay_labels: overlayLabels,
    },
  });
  if (error) throw error;
  const raw = data as { error?: string; segments?: BriefSegment[] };
  if (raw.error) throw new Error(raw.error);
  return raw.segments ?? [];
}

// ---------------------------------------------------------------------------
// brief_segments: direct reads and render-field writes (admin RLS)

export async function listBriefSegments(
  briefId: string,
): Promise<BriefSegment[]> {
  const { data, error } = await supabase
    .from('brief_segments')
    .select('*')
    .eq('brief_id', briefId)
    .order('slot_index', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Overlay toggles and screenshots are direct row updates, never the RPC.
 * The RPC preserves these fields on surviving rows across re-derives.
 */
export async function updateBriefSegment(
  id: string,
  patch: {
    overlay_text?: string | null;
    show_on_screen?: boolean;
    screenshot_url?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('brief_segments')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

/** Uploads to the private brief-assets bucket; returns the storage path. */
export async function uploadSegmentScreenshot(params: {
  companyId: string;
  briefId: string;
  segmentId: string;
  localUri: string;
}): Promise<string> {
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error('Could not read the image');
  const blob = await response.blob();
  const path = `${params.companyId}/${params.briefId}/${params.segmentId}.jpg`;
  const { error } = await supabase.storage
    .from('brief-assets')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

export async function signedScreenshotUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('brief-assets')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// post types and row states

/** All eight seeded types, sorted for pickers and setup screens. */
export async function listPostTypes(): Promise<PostType[]> {
  const { data, error } = await supabase
    .from('post_types')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type BriefRowState = 'empty' | 'partial' | 'filled' | 'complete';

/**
 * Agent 1's four-state derivation, from the briefs row alone. A killed
 * slot is state 'empty' and the row renders kill_reason. Types with
 * requires_plug false (replay_bait) do not require a cta to count as
 * filled.
 */
export function briefRowState(
  brief: Brief,
  postType: Pick<PostType, 'min_points' | 'max_points' | 'requires_plug'> | null,
): BriefRowState {
  if (brief.reviewed_at) return 'complete';
  const points = parseTalkingPoints(brief.talking_points);
  const hasHook = Boolean(brief.hook?.trim());
  const hasCta = Boolean(brief.cta?.trim());
  const hasCaption = Boolean(brief.caption?.trim());
  const hashtagsOk = brief.hashtags.length >= 3 && brief.hashtags.length <= 5;
  const pointsOk = postType
    ? points.length >= postType.min_points && points.length <= postType.max_points
    : points.length > 0;
  const ctaOk = postType && !postType.requires_plug ? true : hasCta;
  if (hasHook && ctaOk && hasCaption && hashtagsOk && pointsOk) return 'filled';
  if (
    hasHook ||
    hasCta ||
    hasCaption ||
    brief.hashtags.length > 0 ||
    points.length > 0
  ) {
    return 'partial';
  }
  return 'empty';
}

/** Lowest used_count first so the long tail gets covered. */
export async function listSearchQueries(): Promise<SearchQuery[]> {
  const { data, error } = await supabase
    .from('search_queries')
    .select('*')
    .order('used_count', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Bump after the admin saves the draft brief from this query. */
export async function markSearchQueryUsed(id: string): Promise<void> {
  const { data, error: readError } = await supabase
    .from('search_queries')
    .select('used_count')
    .eq('id', id)
    .single();
  if (readError) throw readError;
  const { error } = await supabase
    .from('search_queries')
    .update({
      used_count: (data?.used_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Pre-stamped rows carry the phrase, not the query id. Bump when a fill
 * from that phrase succeeds; a stamp alone never counts as a use. No-op
 * when the phrase is not in the bank (hand-typed phrases).
 */
export async function markSearchQueryUsedByText(query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  const { data, error } = await supabase
    .from('search_queries')
    .select('id')
    .eq('query', q)
    .maybeSingle();
  if (error || !data) return;
  await markSearchQueryUsed(data.id).catch(() => undefined);
}

export async function createBrief(params: {
  companyId: string;
  createdBy: string;
  input: BriefInput;
}): Promise<Brief> {
  const { data, error } = await supabase
    .from('briefs')
    .insert({
      company_id: params.companyId,
      created_by: params.createdBy,
      title: params.input.title,
      format: params.input.format,
      hook: params.input.hook,
      hook_options: params.input.hook_options,
      talking_points: params.input.talking_points,
      hashtags: params.input.hashtags,
      search_phrase: params.input.search_phrase,
      point_count: params.input.point_count,
      target_words: params.input.target_words,
      script: params.input.script,
      caption: params.input.caption,
      why_it_works: params.input.why_it_works,
      cta: params.input.cta,
      post_type_id: params.input.post_type_id,
      kill_reason: params.input.kill_reason,
      generation_id: params.input.generation_id,
      example_url: params.input.example_url,
      example_transcript: params.input.example_transcript,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getBrief(id: string): Promise<BriefWithType | null> {
  const { data, error } = await supabase
    .from('briefs')
    .select('*, post_types(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as BriefWithType | null;
}

export async function updateBrief(
  id: string,
  patch: Partial<BriefInput>,
): Promise<void> {
  const { error } = await supabase.from('briefs').update(patch).eq('id', id);
  if (error) throw error;
}

/** Briefs are never deleted; the backlog is the moat. */
export async function archiveBrief(id: string): Promise<void> {
  const { error } = await supabase
    .from('briefs')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function createCampaign(params: {
  companyId: string;
  name: string;
  dropDate: string;
}): Promise<Campaign> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      company_id: params.companyId,
      name: params.name,
      drop_date: params.dropDate,
      status: 'draft',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Week setup output: the campaign with its targets and pool, plus one
 * pre-stamped brief per slot (videos first, then slideshows, types in
 * sort order). Each row gets a post type and a suggested search phrase
 * from the bank — lowest used_count first, deduped against phrases used
 * in campaigns from the last four weeks and within this batch. The stamp
 * is not a use; used_count bumps when a fill succeeds. The phrase doubles
 * as the provisional title (briefs.title is NOT NULL) until a fill
 * replaces it.
 */
export async function createWeek(params: {
  companyId: string;
  createdBy: string;
  name: string;
  dropDate: string;
  videoTarget: number;
  slideshowTarget: number;
  typeSplit: Record<string, number>;
  postTypes: PostType[];
}): Promise<Campaign> {
  const since = new Date(
    new Date(`${params.dropDate}T00:00:00`).getTime() - 28 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const [{ data: recent, error: recentError }, queries] = await Promise.all([
    supabase.from('campaigns').select('id').gte('drop_date', since),
    listSearchQueries(),
  ]);
  if (recentError) throw recentError;

  const usedPhrases = new Set<string>();
  const recentIds = (recent ?? []).map((c) => c.id);
  if (recentIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from('campaign_briefs')
      .select('briefs(search_phrase)')
      .in('campaign_id', recentIds);
    if (linksError) throw linksError;
    for (const link of links ?? []) {
      const brief = Array.isArray(link.briefs) ? link.briefs[0] : link.briefs;
      if (brief?.search_phrase) usedPhrases.add(brief.search_phrase);
    }
  }
  // Fresh phrases first; recently used ones only when the bank runs short
  // (12 seeded queries, 30 slots). Repeats within the batch come last.
  const fresh = queries.filter((q) => !usedPhrases.has(q.query));
  const stale = queries.filter((q) => usedPhrases.has(q.query));
  const pool = [...fresh, ...stale];
  const phraseFor = (slot: number): string | null =>
    pool.length > 0 ? pool[slot % pool.length].query : null;

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      company_id: params.companyId,
      name: params.name,
      drop_date: params.dropDate,
      status: 'draft',
      video_target: params.videoTarget,
      slideshow_target: params.slideshowTarget,
      type_split: params.typeSplit,
    })
    .select('*')
    .single();
  if (campaignError) throw campaignError;

  const orderedTypes = [
    ...params.postTypes.filter((t) => t.family === 'video'),
    ...params.postTypes.filter((t) => t.family === 'photo_carousel'),
  ];
  const slots: { postType: PostType; phrase: string | null }[] = [];
  for (const postType of orderedTypes) {
    const count = params.typeSplit[postType.key] ?? 0;
    for (let i = 0; i < count; i += 1) {
      slots.push({ postType, phrase: phraseFor(slots.length) });
    }
  }

  const { data: briefs, error: briefsError } = await supabase
    .from('briefs')
    .insert(
      slots.map((slot) => ({
        company_id: params.companyId,
        created_by: params.createdBy,
        title: slot.phrase ?? slot.postType.label,
        format: slot.postType.family,
        post_type_id: slot.postType.id,
        search_phrase: slot.phrase,
      })),
    )
    .select('id');
  if (briefsError) throw briefsError;

  const { error: linkError } = await supabase.from('campaign_briefs').insert(
    (briefs ?? []).map((brief, i) => ({
      campaign_id: campaign.id,
      brief_id: brief.id,
      company_id: params.companyId,
      position: i,
    })),
  );
  if (linkError) throw linkError;
  return campaign;
}

export async function getLatestCampaign(): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .not('drop_date', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .not('drop_date', 'is', null)
    .order('drop_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCampaignBriefs(
  campaignId: string,
): Promise<CampaignBriefItem[]> {
  const { data, error } = await supabase
    .from('campaign_briefs')
    .select('*, briefs(*, post_types(*))')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CampaignBriefItem[];
}

export async function addBriefToCampaign(params: {
  campaignId: string;
  briefId: string;
  companyId: string;
}): Promise<void> {
  const { count, error: countError } = await supabase
    .from('campaign_briefs')
    .select('brief_id', { count: 'exact', head: true })
    .eq('campaign_id', params.campaignId);
  if (countError) throw countError;
  const { error } = await supabase.from('campaign_briefs').insert({
    campaign_id: params.campaignId,
    brief_id: params.briefId,
    company_id: params.companyId,
    position: count ?? 0,
  });
  if (error) throw error;
}

export async function removeBriefFromCampaign(
  campaignId: string,
  briefId: string,
): Promise<void> {
  const { error } = await supabase
    .from('campaign_briefs')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('brief_id', briefId);
  if (error) throw error;
}

export async function reorderCampaignBriefs(
  campaignId: string,
  orderedBriefIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedBriefIds.length; i += 1) {
    const { error } = await supabase
      .from('campaign_briefs')
      .update({ position: i })
      .eq('campaign_id', campaignId)
      .eq('brief_id', orderedBriefIds[i]);
    if (error) throw error;
  }
}

/**
 * The backlog: briefs not attached to a published campaign (and not already
 * in the campaign being edited), never archived.
 */
export async function listBacklogBriefs(
  excludeCampaignId?: string,
): Promise<Brief[]> {
  const [{ data: links, error: linksError }, { data: briefs, error: briefsError }] =
    await Promise.all([
      supabase
        .from('campaign_briefs')
        .select('brief_id, campaign_id, campaigns!inner(status)'),
      supabase
        .from('briefs')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
    ]);
  if (linksError) throw linksError;
  if (briefsError) throw briefsError;

  const taken = new Set<string>();
  for (const link of links ?? []) {
    const campaign = Array.isArray(link.campaigns)
      ? link.campaigns[0]
      : link.campaigns;
    if (campaign?.status === 'published' || link.campaign_id === excludeCampaignId) {
      taken.add(link.brief_id);
    }
  }
  return (briefs ?? []).filter((b) => !taken.has(b.id));
}

export type PublishResult = {
  creators: number;
  assignments_written: number;
  notified: number;
  /** True when the push is deferred to Sunday 8PM EST via notify-scheduled. */
  scheduled: boolean;
  notify_at: string | null;
};

/** Publishes through the deployed publish-campaign function (shuffle + RPC). */
export async function publishCampaign(campaignId: string): Promise<PublishResult> {
  const { data, error } = await supabase.functions.invoke('publish-campaign', {
    body: { campaign_id: campaignId },
  });
  if (error) throw error;
  const result = data as Partial<PublishResult> & { error?: string };
  if (result.error) throw new Error(result.error);
  return {
    creators: result.creators ?? 0,
    assignments_written: result.assignments_written ?? 0,
    notified: result.notified ?? 0,
    scheduled: result.scheduled === true,
    notify_at: result.notify_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// AI review (Agent 4). The admin hits Review in the post editor: brief-review
// runs Tier 1 (deterministic) + Tier 2 (one structural call) + Tier 3 (spoken
// or written) against the editor's current draft and returns checks, scores
// and the Tier 3 verdict. Review never blocks and never edits; the editor
// applies accepted suggestions itself and logs everything on confirm.

export type ReviewScores = {
  overall: number;
  hook: number;
  talking_points: number;
  cta: number;
};

export type Tier3Verdict = { spoken: boolean; worst_line: string | null };

export type BriefReviewResult = {
  checks: ReviewCheck[];
  scores: ReviewScores;
  tier3: Tier3Verdict;
};

export async function reviewBrief(params: {
  draft: RegenDraftPayload;
  postTypeKey?: string;
  hookIndex?: number;
}): Promise<BriefReviewResult> {
  const { data, error } = await supabase.functions.invoke('brief-review', {
    body: {
      draft: params.draft,
      ...(params.postTypeKey ? { post_type: params.postTypeKey } : {}),
      ...(typeof params.hookIndex === 'number' ? { hook_index: params.hookIndex } : {}),
    },
  });
  if (error) throw error;
  const raw = data as Partial<BriefReviewResult> & { error?: string };
  if (raw.error) throw new Error(raw.error);
  return {
    checks: raw.checks ?? [],
    scores: raw.scores ?? { overall: 0, hook: 0, talking_points: 0, cta: 0 },
    tier3: raw.tier3 ?? { spoken: true, worst_line: null },
  };
}

/**
 * Client-side Tier 1 re-run at confirm time, so overrides are logged against
 * what is still fired after edits, not against the stale review response.
 */
export function runClientTier1(
  draft: RegenDraftPayload,
  ctx: {
    hashtagBank: string[];
    approvedClaimIds: string[];
    postType: PostTypeShape | null;
  },
): ReviewCheck[] {
  return runTier1Checks(draft, ctx);
}

/** Approved product_features ids, for the client-side plug traceability check. */
export async function listApprovedClaimIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('product_features')
    .select('id')
    .eq('approved', true);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export type BriefReviewEventInput = {
  brief_id: string;
  company_id: string;
  author_id: string;
  event: 'override' | 'edit' | 'confirm';
  check_id?: string;
  tier?: number;
  diff?: { field: string; before: string | null; after: string | null };
};

/** The override log is the point, not telemetry. One row per override/edit/confirm. */
export async function logBriefReviewEvents(
  events: BriefReviewEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  const { error } = await supabase.from('brief_review_events').insert(
    events.map((e) => ({
      brief_id: e.brief_id,
      company_id: e.company_id,
      author_id: e.author_id,
      event: e.event,
      check_id: e.check_id ?? null,
      tier: e.tier ?? null,
      diff: (e.diff ?? null) as Json,
    })),
  );
  if (error) throw error;
}

/** Rewritten generated lines feed the tenant ban list; generation avoids them. */
export async function appendBannedPhrases(
  companyId: string,
  phrases: string[],
): Promise<void> {
  const cleaned = phrases.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return;
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('id, banned_phrases')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const existing = data.banned_phrases ?? [];
  const merged = [...existing, ...cleaned.filter((p) => !existing.includes(p))];
  if (merged.length === existing.length) return;
  const { error: writeError } = await supabase
    .from('brand_profiles')
    .update({ banned_phrases: merged })
    .eq('id', data.id);
  if (writeError) throw writeError;
}

/** Confirm flips the post to complete: reviewed_at + the review snapshot. */
export async function confirmBriefReview(
  briefId: string,
  result: BriefReviewResult,
): Promise<void> {
  const { error } = await supabase
    .from('briefs')
    .update({
      reviewed_at: new Date().toISOString(),
      review_result: result as unknown as Json,
    })
    .eq('id', briefId);
  if (error) throw error;
}
