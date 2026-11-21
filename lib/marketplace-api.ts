/**
 * Marketplace reads and writes. Every write is a database function (migration
 * 155) so the rules live in one place: who may sign, who may accept, what an
 * invite does.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CreatorFilters,
  CreatorResume,
  CreatorSort,
  FeedListing,
  Listing,
  MarketCreator,
} from './marketplace';
import { supabase } from './supabase';

// lib/types.ts is generated and does not know migration 155 yet; these calls
// are typed by the shapes in lib/marketplace.ts instead.
const db = supabase as unknown as SupabaseClient;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------ creator

export async function loadFeed(): Promise<FeedListing[]> {
  const { data, error } = await db.rpc('marketplace_feed');
  fail(error);
  return (data ?? []) as FeedListing[];
}

export async function loadMyResume(userId: string): Promise<CreatorResume | null> {
  const { data, error } = await db.from('creator_profiles').select('*').eq('user_id', userId).maybeSingle();
  fail(error);
  return (data as CreatorResume | null) ?? null;
}

export async function saveMyResume(patch: Partial<Omit<CreatorResume, 'user_id'>>): Promise<CreatorResume> {
  const { data, error } = await db.rpc('save_creator_profile', { p_patch: patch });
  fail(error);
  return data as CreatorResume;
}

/** Sign the agreement and apply; on an invite this also joins the company. */
export async function signAndApply(listingId: string, signedName: string, note: string): Promise<{ status: string; start_date: string | null }> {
  const { data, error } = await db.rpc('apply_to_listing', {
    p_listing_id: listingId,
    p_signed_name: signedName,
    p_note: note.trim() || null,
  });
  fail(error);
  return data as { status: string; start_date: string | null };
}

export async function withdrawApplication(applicationId: string): Promise<void> {
  const { error } = await db.rpc('withdraw_marketplace_application', { p_id: applicationId });
  fail(error);
}

// ------------------------------------------------------------------ company

export async function loadMyListings(companyId: string): Promise<Listing[]> {
  const { data, error } = await db
    .from('marketplace_listings')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  fail(error);
  return (data ?? []) as Listing[];
}

/** Creates the listing when id is null; the server writes the starting agreement. */
export async function saveListing(id: string | null, patch: Partial<Omit<Listing, 'id' | 'company_id' | 'contract_version' | 'opened_at'>>): Promise<Listing> {
  const { data, error } = await db.rpc('save_marketplace_listing', { p_id: id, p_patch: patch });
  fail(error);
  return data as Listing;
}

export type CreatorQuery = {
  listingId: string | null;
  scope: 'all' | 'applicants' | 'invited';
  search?: string;
  filters?: CreatorFilters;
  sort?: CreatorSort;
  limit?: number;
  offset?: number;
};

export async function loadCreators(q: CreatorQuery): Promise<{ total: number; rows: MarketCreator[] }> {
  const f = q.filters;
  const { data, error } = await db.rpc('marketplace_creators', {
    p_listing_id: q.listingId,
    p_scope: q.scope,
    p_search: q.search?.trim() || null,
    p_niches: f && f.niches.length > 0 ? f.niches : null,
    p_gender: f?.gender ?? null,
    p_min_age: f?.minAge ?? null,
    p_max_age: f?.maxAge ?? null,
    p_min_views: f?.minViews ?? null,
    p_min_earned_cents: f?.minEarnedCents ?? null,
    p_min_followers: f?.minFollowers ?? null,
    p_experience: f?.experience ?? null,
    p_sort: q.sort ?? 'match',
    p_limit: q.limit ?? 100,
    p_offset: q.offset ?? 0,
  });
  fail(error);
  const out = (data ?? { total: 0, rows: [] }) as { total: number; rows: MarketCreator[] };
  return { total: out.total, rows: out.rows.map((r) => ({ ...r, niches: r.niches ?? [], styles: r.styles ?? [], portfolio: Array.isArray(r.portfolio) ? r.portfolio : [] })) };
}

export async function inviteCreator(listingId: string, creatorId: string, message: string): Promise<void> {
  const { error } = await db.rpc('invite_creator_to_listing', {
    p_listing_id: listingId,
    p_creator_id: creatorId,
    p_message: message.trim() || null,
  });
  fail(error);
}

export async function decideApplication(applicationId: string, accept: boolean, startDate?: string | null): Promise<{ status: string; start_date: string | null }> {
  const { data, error } = await db.rpc('decide_marketplace_application', {
    p_id: applicationId,
    p_accept: accept,
    p_note: null,
    p_start_date: startDate ?? null,
  });
  fail(error);
  return data as { status: string; start_date: string | null };
}

/** The agreement exactly as this creator signed it. */
export async function loadSignedContract(applicationId: string): Promise<{ contract_title: string | null; contract_body: string | null; signed_name: string | null; signed_at: string | null } | null> {
  const { data, error } = await db
    .from('marketplace_applications')
    .select('contract_title, contract_body, signed_name, signed_at')
    .eq('id', applicationId)
    .maybeSingle();
  fail(error);
  return data as { contract_title: string | null; contract_body: string | null; signed_name: string | null; signed_at: string | null } | null;
}

/**
 * Asks the AI to score every listed creator against this listing and saves
 * the scores. Resolves with how many were ranked; the caller reloads.
 */
export async function rankWithAi(listingId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke<{ ranked?: number; error?: string }>('marketplace-match', {
    body: { listing_id: listingId },
    timeout: 120_000,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data?.ranked ?? 0;
}

/** Signed photo URLs for a page of creators; missing or unreadable photos fall back to initials. */
export async function signAvatars(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await supabase.storage.from('avatars').createSignedUrls(unique, 3600);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) out.set(entry.path, entry.signedUrl);
  }
  return out;
}
