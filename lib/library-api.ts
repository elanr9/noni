// Library data layer (Agent 5). One table, four source chips; "Our posts"
// reads live from posts via the library_our_posts RPC (migration 029) because
// nothing syncs posts into library_items — an our_post row is created lazily
// the first time a post is used from the picker, purely to carry
// used_count / last_used_at. Using an item marks it used, never removes it.

import { supabase } from './supabase';
import type { Database } from './types';

export type LibraryItem = Database['public']['Tables']['library_items']['Row'];
export type LibrarySource = 'idea' | 'our_post' | 'reference' | 'from_creator';

export type OurPost =
  Database['public']['Functions']['library_our_posts']['Returns'][number];
export type OurPostsSort = 'top' | 'recent';

const PAGE_SIZE = 50;

/** A single-line paste that is one http(s) URL routes to a reference. */
export function isCaptureUrl(raw: string): boolean {
  const line = raw.trim();
  return /^https?:\/\/\S+$/i.test(line) && !line.includes('\n');
}

export async function listLibraryItems(params: {
  source: Exclude<LibrarySource, 'our_post'>;
  search?: string;
  /** Picker filter: items of this type OR untyped (ideas carry no type). */
  postTypeId?: string;
  limit?: number;
  offset?: number;
}): Promise<LibraryItem[]> {
  let query = supabase
    .from('library_items')
    .select('*')
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
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
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

/**
 * Quick capture: one field, zero forms. A pasted URL becomes a reference
 * (thumbnail resolves in the background); anything else becomes one idea per
 * non-empty line, so the Google Doc bulk import is one paste.
 */
export async function captureQuick(
  companyId: string,
  userId: string,
  raw: string,
): Promise<{ ideas: number; reference: boolean }> {
  if (isCaptureUrl(raw)) {
    await saveReference(companyId, userId, raw.trim());
    return { ideas: 0, reference: true };
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { ideas: 0, reference: false };

  const { error } = await supabase.from('library_items').insert(
    lines.map((text) => ({
      company_id: companyId,
      source: 'idea',
      text,
      created_by: userId,
    })),
  );
  if (error) throw error;
  return { ideas: lines.length, reference: false };
}

/**
 * Insert the reference row immediately, then resolve thumbnail and title
 * through the library-link edge function without blocking the save. A link
 * that resolves nothing stays a reference without art.
 */
export async function saveReference(
  companyId: string,
  userId: string,
  url: string,
): Promise<LibraryItem> {
  const { data, error } = await supabase
    .from('library_items')
    .insert({
      company_id: companyId,
      source: 'reference',
      url,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) throw error;

  void enrichReference(data.id, url);
  return data;
}

async function enrichReference(itemId: string, url: string): Promise<void> {
  try {
    const { data } = await supabase.functions.invoke('library-link', {
      body: { url },
    });
    const preview = data as { thumbnail_url?: string | null; title?: string | null } | null;
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

/** Creator filter options for the Our posts chip; lighter than the leaderboard. */
export async function listCreatorOptions(
  companyId: string,
): Promise<Array<{ id: string; full_name: string | null }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('company_id', companyId)
    .eq('role', 'creator')
    .order('full_name');
  if (error) throw error;
  return data ?? [];
}

/** Increment usage; never deletes. */
export async function markLibraryItemUsed(item: LibraryItem): Promise<void> {
  const { error } = await supabase
    .from('library_items')
    .update({
      used_count: item.used_count + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', item.id);
  if (error) throw error;
}

/**
 * Our posts have no library_items row until first use: find-or-create by
 * post_id, then increment.
 */
export async function markOurPostUsed(
  companyId: string,
  userId: string,
  post: OurPost,
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('library_items')
    .select('*')
    .eq('source', 'our_post')
    .eq('post_id', post.post_id)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    await markLibraryItemUsed(existing);
    return;
  }

  const { error } = await supabase.from('library_items').insert({
    company_id: companyId,
    source: 'our_post',
    post_id: post.post_id,
    creator_id: post.creator_id,
    post_type_id: post.post_type_id,
    text: post.title ?? post.hook,
    url: post.post_url,
    used_count: 1,
    last_used_at: new Date().toISOString(),
    created_by: userId,
  });
  if (error) throw error;
}
