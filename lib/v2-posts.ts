/**
 * One post model for the v2 admin screens: live posts from the analytics
 * feed (views and per-platform engagement) joined with every assignment
 * (state, creator, scheduled day) and the creator roster (names, handles,
 * photos, earnings). Posts match library briefs by `libraryBriefId`.
 */
import { create } from 'zustand';

import { fetchAllRows, fetchCompanyAnalytics, type AnalyticsDay, type AnalyticsPost, type PlatformStats } from './analytics-api';
import type { Brief } from './brief-library';
import { supabase } from './supabase';
import { parseDayKey, today } from './v2-format';
import type { Tone } from '../theme/v2';

export type PostState = 'Posted' | 'Waiting' | 'Approved' | 'Changes requested' | 'Recording' | 'Open';
export type PostFormat = 'Reel' | 'Slideshow';

export type V2Post = {
  id: string;
  assignmentId: string | null;
  /** Weekly brief id. */
  briefId: string | null;
  /** Library brief this post was made from, when known. */
  libraryBriefId: string | null;
  title: string;
  creatorId: string | null;
  creatorName: string;
  state: PostState;
  /** Day it went live (Posted) or the scheduled day; local midnight. */
  date: Date;
  format: PostFormat;
  views: number;
  tiktok: PlatformStats;
  instagram: PlatformStats;
  postUrl: string | null;
  /** Sign-ups and sales credited to the post from its creator's code. */
  signups: number;
  salesCents: number;
  earnedCents: number;
  /** Media to thumbnail from: the latest submission's video or first slide. */
  mediaPath: string | null;
  mediaFormat: 'video' | 'photo_carousel';
};

export type V2Creator = {
  id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  tone: Tone;
  posts: number;
  views: number;
  earnedCents: number;
  /** The promo code this creator hands out; sales on it are theirs. */
  code: string | null;
  /** Sign-ups and sales on the creator's code. */
  signups: number;
  salesCents: number;
};

const TONES: Tone[] = ['blue', 'purple', 'green', 'amber', 'pink'];

const STATE_BY_STATUS: Record<string, PostState> = {
  assigned: 'Recording',
  recorded: 'Recording',
  submitted: 'Waiting',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  posted: 'Posted',
};

const EMPTY_STATS = (): PlatformStats => ({ views: 0, likes: 0, saves: 0, comments: 0, shares: 0 });

type AssignmentRow = {
  id: string;
  brief_id: string;
  library_brief_id: string | null;
  creator_id: string;
  scheduled_date: string;
  status: string;
  submission_id: string | null;
  post_url: string | null;
  briefs: { title: string | null; format: string | null } | null;
  profiles: { full_name: string | null } | null;
  submissions: { render_status: string | null; video_path: string | null; segment_paths: string[] | null } | null;
};

type RosterRow = { id: string | null; full_name: string | null; avatar_path: string | null };
type AccountRow = { creator_id: string; tiktok_handle: string | null; instagram_handle: string | null };

type DataState = {
  companyId: string | null;
  posts: V2Post[];
  creators: V2Creator[];
  /** Views per local day, ascending from the first activity to today (analytics feed). */
  days: AnalyticsDay[];
  /** The company linked Stripe on the web: sign-ups and sales exist. */
  stripeConnected: boolean;
  /** Stripe itself is linked: sales in dollars exist. */
  salesConnected: boolean;
  /** Dev preview only: stands in for the signed in manager's access. */
  previewAccess: { viewSignups: boolean; viewFinancials: boolean } | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load(companyId: string, force?: boolean): Promise<void>;
  seed(data: { posts: V2Post[]; creators: V2Creator[]; days: AnalyticsDay[]; stripeConnected?: boolean; salesConnected?: boolean }): void;
  /** Sets or clears a creator's promo code. Returns an error message, or null when saved. */
  setCreatorCode(creatorId: string, code: string): Promise<string | null>;
};

function formatOf(format: string | null | undefined): PostFormat {
  return format === 'photo_carousel' ? 'Slideshow' : 'Reel';
}

function mediaOf(sub: AssignmentRow['submissions']): string | null {
  if (!sub) return null;
  if (sub.render_status === 'ready') return sub.video_path;
  return sub.segment_paths?.[0] ?? sub.video_path;
}

/** A forced refresh requested while a load was in flight. */
let queuedRefresh: string | null = null;

export const useV2Data = create<DataState>((set, get) => ({
  companyId: null,
  posts: [],
  creators: [],
  days: [],
  stripeConnected: false,
  salesConnected: false,
  previewAccess: null,
  loaded: false,
  loading: false,
  error: null,

  async load(companyId, force = false) {
    if (get().loading) {
      // A forced refresh asked for mid-flight runs once the current load lands.
      if (force) queuedRefresh = companyId;
      return;
    }
    if (get().companyId === companyId && get().loaded && !force) return;
    set({ loading: true, error: null, companyId });
    try {
      const [analytics, assignmentRows, rosterRes, accountsRes, ledgerRes, codesRes] = await Promise.all([
                fetchCompanyAnalytics(companyId),
        fetchAllRows<AssignmentRow>((from, to) =>
          supabase
            .from('assignments')
            .select('id, brief_id, library_brief_id, creator_id, scheduled_date, status, submission_id, post_url, briefs:brief_id ( title, format ), profiles:creator_id ( full_name ), submissions:submission_id ( render_status, video_path, segment_paths )')
            .eq('company_id', companyId)
            .order('scheduled_date', { ascending: false })
            .order('id')
            .range(from, to),
        ),
        supabase.from('company_roster').select('id, full_name, avatar_path').eq('company_id', companyId).or('member_role.eq.creator,can_create.eq.true').order('full_name'),
        supabase.from('creator_accounts').select('creator_id, tiktok_handle, instagram_handle').eq('company_id', companyId),
        supabase.from('wallet_ledger').select('creator_id, amount_cents').eq('company_id', companyId).gt('amount_cents', 0),
        supabase.from('attribution_links').select('creator_id, code').eq('company_id', companyId).not('creator_id', 'is', null).is('task_id', null).is('assignment_id', null),
      ]);
      if (rosterRes.error) throw rosterRes.error;
      if (get().companyId !== companyId) return;

      const liveByAssignment = new Map<string, AnalyticsPost>();
      for (const p of analytics.posts) if (p.assignmentId) liveByAssignment.set(p.assignmentId, p);

      const posts: V2Post[] = [];
      const seen = new Set<string>();
      const limit = today();
      for (const a of assignmentRows) {
        const live = liveByAssignment.get(a.id);
        const state = live ? 'Posted' : (STATE_BY_STATUS[a.status] ?? 'Recording');
        const date = live ? parseDayKey(live.day) : parseDayKey(a.scheduled_date);
        // Never show posts after today.
        if (state === 'Posted' && date > limit) continue;
        seen.add(a.id);
        posts.push({
          id: a.id,
          assignmentId: a.id,
          briefId: a.brief_id,
          libraryBriefId: a.library_brief_id ?? live?.libraryBriefId ?? null,
          title: a.briefs?.title ?? live?.title ?? 'Post',
          creatorId: a.creator_id,
          creatorName: a.profiles?.full_name?.trim() || live?.creatorName || 'Creator',
          state,
          date,
          format: formatOf(a.briefs?.format),
          views: live?.views ?? 0,
          tiktok: live?.tiktok ?? EMPTY_STATS(),
          instagram: live?.instagram ?? EMPTY_STATS(),
          postUrl: live?.postUrl ?? a.post_url,
          signups: live?.signups ?? 0,
          salesCents: live?.salesCents ?? 0,
          earnedCents: live?.earnedCents ?? 0,
          mediaPath: mediaOf(a.submissions),
          mediaFormat: a.briefs?.format === 'photo_carousel' ? 'photo_carousel' : 'video',
        });
      }
      // Live posts from legacy tasks (no assignment).
      for (const p of analytics.posts) {
        if (p.assignmentId && seen.has(p.assignmentId)) continue;
        const date = parseDayKey(p.day);
        if (date > limit) continue;
        posts.push({
          id: p.id,
          assignmentId: p.assignmentId,
          briefId: p.briefId,
          libraryBriefId: p.libraryBriefId,
          title: p.title,
          creatorId: p.creatorId,
          creatorName: p.creatorName,
          state: 'Posted',
          date,
          format: p.format === 'photo_carousel' ? 'Slideshow' : 'Reel',
          views: p.views,
          tiktok: p.tiktok,
          instagram: p.instagram,
          postUrl: p.postUrl,
          signups: p.signups,
          salesCents: p.salesCents,
          earnedCents: p.earnedCents,
          mediaPath: null,
          mediaFormat: p.format === 'photo_carousel' ? 'photo_carousel' : 'video',
        });
      }

      const roster = (rosterRes.data ?? []) as RosterRow[];
      const paths = roster.map((r) => r.avatar_path).filter((p): p is string => !!p);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data } = await supabase.storage.from('avatars').createSignedUrls(paths, 3600);
        for (const e of data ?? []) if (e.path && e.signedUrl) signed.set(e.path, e.signedUrl);
      }
      const handles = new Map<string, string>();
      for (const acc of (accountsRes.data ?? []) as AccountRow[]) {
        const h = acc.tiktok_handle ?? acc.instagram_handle;
        if (h) handles.set(acc.creator_id, h.startsWith('@') ? h : `@${h}`);
      }
      const earned = new Map<string, number>();
      for (const e of ledgerRes.data ?? []) earned.set(e.creator_id, (earned.get(e.creator_id) ?? 0) + e.amount_cents);

      const codes = new Map<string, string>();
      for (const row of codesRes.data ?? []) if (row.creator_id) codes.set(row.creator_id, row.code);

      const creators: V2Creator[] = roster
        .filter((r): r is RosterRow & { id: string } => !!r.id)
        .map((r, i) => {
          const mine = posts.filter((p) => p.creatorId === r.id && p.state === 'Posted');
          return {
            id: r.id,
            name: r.full_name?.trim() || 'Creator',
            handle: handles.get(r.id) ?? null,
            photo: r.avatar_path ? (signed.get(r.avatar_path) ?? null) : null,
            tone: TONES[i % TONES.length],
            posts: mine.length,
            views: mine.reduce((n, p) => n + p.views, 0),
            earnedCents: earned.get(r.id) ?? 0,
            code: codes.get(r.id) ?? null,
            signups: analytics.creatorSales.get(r.id)?.signups ?? 0,
            salesCents: analytics.creatorSales.get(r.id)?.salesCents ?? 0,
          };
        });

      set({ posts, creators, days: analytics.days, stripeConnected: analytics.stripeConnected, salesConnected: analytics.salesConnected, loaded: true, loading: false });
    } catch (e) {
      set({ loading: false, loaded: true, error: e instanceof Error ? e.message : 'Could not load' });
    }
    const next = queuedRefresh;
    queuedRefresh = null;
    if (next !== null && next === get().companyId) await get().load(next, true);
  },

  seed(data) {
    set({ ...data, stripeConnected: data.stripeConnected ?? false, salesConnected: data.salesConnected ?? data.stripeConnected ?? false, loaded: true, loading: false, companyId: get().companyId ?? 'preview' });
  },

  async setCreatorCode(creatorId, raw) {
    const companyId = get().companyId;
    if (!companyId) return 'Not signed in.';
    const code = raw.trim().toUpperCase();
    if (code && !/^[A-Z0-9_-]{3,32}$/.test(code)) return 'Use 3 to 32 letters and numbers, no spaces.';
    const mine = () => supabase.from('attribution_links').delete().eq('company_id', companyId).eq('creator_id', creatorId).is('task_id', null).is('assignment_id', null);
    if (!code) {
      const { error } = await mine();
      if (error) return 'Could not remove the code. Try again.';
    } else {
      const taken = get().creators.find((c) => c.id !== creatorId && c.code?.toUpperCase() === code);
      if (taken) return `${taken.name} already has that code.`;
      const { error: clearError } = await mine();
      if (clearError) return 'Could not save the code. Try again.';
      const { error } = await supabase.from('attribution_links').insert({ company_id: companyId, creator_id: creatorId, code });
      if (error) return error.code === '23505' ? 'That code is already in use.' : 'Could not save the code. Try again.';
    }
    set({ creators: get().creators.map((c) => (c.id === creatorId ? { ...c, code: code || null } : c)) });
    return null;
  },
}));

/** Live posts only, newest first, one per title. */
export function livePosts(posts: V2Post[]): V2Post[] {
  return posts.filter((p) => p.state === 'Posted').sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Posts made from a library brief, matched on the assignment's
 * library_brief_id only. Titles are not unique (two briefs can share one,
 * weekly briefs reuse them), so a title match would count other briefs' posts.
 * Live, waiting and approved only.
 */
export function postsForBrief(posts: V2Post[], brief: Pick<Brief, 'id'>): V2Post[] {
  return posts.filter((p) => p.libraryBriefId === brief.id && (p.state === 'Posted' || p.state === 'Waiting' || p.state === 'Approved'));
}

export function creatorById(creators: V2Creator[], id: string | null): V2Creator | undefined {
  return id ? creators.find((c) => c.id === id) : undefined;
}

/** Fallback creator card for a post whose creator left the roster. */
export function creatorFor(creators: V2Creator[], p: Pick<V2Post, 'creatorId' | 'creatorName'>): V2Creator {
  return creatorById(creators, p.creatorId) ?? { id: p.creatorId ?? 'unknown', name: p.creatorName, handle: null, photo: null, tone: 'grey', posts: 0, views: 0, earnedCents: 0, code: null, signups: 0, salesCents: 0 };
}

/** Sample share split while per-platform metrics are missing. */
export function platformStats(p: V2Post, platform: 'all' | 'tt' | 'ig'): PlatformStats {
  if (platform === 'tt') return p.tiktok;
  if (platform === 'ig') return p.instagram;
  return {
    views: p.views,
    likes: p.tiktok.likes + p.instagram.likes,
    saves: p.tiktok.saves + p.instagram.saves,
    comments: p.tiktok.comments + p.instagram.comments,
    shares: p.tiktok.shares + p.instagram.shares,
  };
}
