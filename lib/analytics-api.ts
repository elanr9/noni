// Analytics explorer data. Engagement (views, likes, saves) comes from
// post_metrics snapshots, sign-ups and sales from conversion_daily (synced
// daily from the Stripe account the company connects on the web), per-post
// earnings from wallet_ledger
// bounty credits, paid-out totals from payouts. Sign-ups and sales only
// count from the day the first campaign started on Noni. Money surfaces
// are also gated in the UI by the Stripe connect date.

import type { ContentFormat } from './admin-review-types';
import { supabase } from './supabase';

export type ViewSnapshot = { t: number; views: number };

export type PlatformStats = { views: number; likes: number; saves: number; comments: number; shares: number };

/**
 * One piece of content. Platform rows (TikTok + Instagram) that share an
 * assignment or task are folded into a single post.
 */
export type AnalyticsPost = {
  id: string;
  /** The assignment this post came from, when it did. */
  assignmentId: string | null;
  /** Weekly brief id (assignments.brief_id). */
  briefId: string | null;
  /** Library brief it was made from; null until the creator flows write it. Posts match library briefs by title until then. */
  libraryBriefId: string | null;
  title: string;
  creatorId: string | null;
  creatorName: string;
  creatorFirst: string;
  format: ContentFormat;
  /** Local calendar day the post went live, YYYY-MM-DD. */
  day: string;
  /** Total views across platforms, latest snapshots. */
  views: number;
  /** Sign-ups and sales credited to this post: its creator's coded customers, split by the views each of the creator's posts was gaining. */
  signups: number;
  salesCents: number;
  earnedCents: number;
  tiktok: PlatformStats;
  instagram: PlatformStats;
  postUrl: string | null;
  /** Cumulative view snapshots per platform row, for range bucketing. */
  series: ViewSnapshot[][];
};

export type AnalyticsDay = {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  views: number;
  /** Every sign-up and sale on the company's Stripe that day. */
  signups: number;
  salesCents: number;
  /** The part that came in on a creator's code. */
  codedSignups: number;
  codedSalesCents: number;
  postIds: string[];
};

export type AnalyticsTotals = {
  views: number;
  posts: number;
  signups: number;
  /** Last 30 days vs the 30 before; null until there is a base to compare. */
  viewsDeltaPct: number | null;
  signupsDeltaPct: number | null;
  postsThisWeek: number;
};

export type PayoutDay = { day: string; amountCents: number };

export type CompanyAnalytics = {
  posts: AnalyticsPost[];
  /** Every day from the first activity (at least the last 84) to today, ascending. */
  days: AnalyticsDay[];
  totals: AnalyticsTotals;
  /** Completed creator payouts, ascending by day. */
  payouts: PayoutDay[];
  /** Sign-ups and sales exist: the company linked Stripe on the web, or its own app reports sign-ups. */
  stripeConnected: boolean;
  /** Sign-ups and sales on each creator's code, by creator id. */
  creatorSales: Map<string, { signups: number; salesCents: number }>;
};

// ————— Money gate —————

export type MoneyGate = {
  /** First day money data exists, YYYY-MM-DD. Null means Stripe is not connected. */
  connectedDay: string | null;
  /** Short label for copy, e.g. "Aug 11". */
  sinceLabel: string | null;
};

export function buildMoneyGate(
  connectedAtIso: string | null,
  fallbackDay?: string,
): MoneyGate {
  const day =
    connectedAtIso !== null
      ? localDayKey(new Date(connectedAtIso))
      : (fallbackDay ?? null);
  if (day === null) return { connectedDay: null, sinceLabel: null };
  return { connectedDay: day, sinceLabel: shortDayLabel(day) };
}

/** True when money data exists for this local day (on or after the connect date). */
export function moneyOn(gate: MoneyGate, day: string): boolean {
  return gate.connectedDay !== null && day >= gate.connectedDay;
}

// ————— Formatting —————

/** "2026-08-11" to "Aug 11" in the device locale's calendar. */
export function shortDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Whole dollars: 41050 cents to "$410". */
export function formatMoney(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

// ————— Chart ranges —————

export const ANALYTICS_RANGES = [
  'Last 24 hours',
  'Last 7 days',
  'Last 2 weeks',
  'Last month',
  'Last 12 weeks',
] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export type ChartSeries = { points: number[]; labels: string[] };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const RANGE_BUCKETS: Record<
  AnalyticsRange,
  { count: number; ms: number; label: 'hour' | 'weekday' | 'date' }
> = {
  'Last 24 hours': { count: 12, ms: 2 * HOUR_MS, label: 'hour' },
  'Last 7 days': { count: 7, ms: DAY_MS, label: 'weekday' },
  'Last 2 weeks': { count: 14, ms: DAY_MS, label: 'date' },
  'Last month': { count: 5, ms: 7 * DAY_MS, label: 'date' },
  'Last 12 weeks': { count: 12, ms: 7 * DAY_MS, label: 'date' },
};

function bucketLabel(t: number, kind: 'hour' | 'weekday' | 'date'): string {
  const date = new Date(t);
  if (kind === 'hour') {
    const h = date.getHours();
    return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
  }
  if (kind === 'weekday') {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function viewsAt(series: ViewSnapshot[][], t: number): number {
  let total = 0;
  for (const row of series) {
    let latest = 0;
    for (const snap of row) {
      if (snap.t > t) break;
      latest = snap.views;
    }
    total += latest;
  }
  return total;
}

/** View deltas bucketed over the range, from the given (pre-filtered) posts. */
export function buildViewsSeries(
  posts: AnalyticsPost[],
  range: AnalyticsRange,
): ChartSeries {
  const spec = RANGE_BUCKETS[range];
  const now = Date.now();
  const points: number[] = [];
  const starts: number[] = [];
  for (let i = 0; i < spec.count; i++) {
    const end = now - (spec.count - 1 - i) * spec.ms;
    const start = end - spec.ms;
    starts.push(start);
    let v = 0;
    for (const post of posts) {
      v += Math.max(0, viewsAt(post.series, end) - viewsAt(post.series, start));
    }
    points.push(v);
  }
  const labels = [
    bucketLabel(starts[0], spec.label),
    bucketLabel(starts[Math.floor(spec.count / 2)], spec.label),
    bucketLabel(starts[spec.count - 1], spec.label),
  ];
  return { points, labels };
}

// ————— Fetch —————

type MetricSnapshot = {
  views: number | null;
  likes: number | null;
  saves: number | null;
  comments: number | null;
  shares: number | null;
  fetched_at: string | null;
};

type PostRow = {
  id: string;
  platform: string | null;
  post_url: string | null;
  posted_at: string | null;
  status: string | null;
  assignment_id: string | null;
  task_id: string | null;
  assignments: {
    company_id: string | null;
    creator_id: string | null;
    brief_id: string | null;
    library_brief_id: string | null;
    briefs: { title: string | null; format: string | null } | null;
    profiles: { full_name: string | null } | null;
  } | null;
  content_tasks: {
    company_id: string | null;
    title: string | null;
    format: string | null;
    assigned_to: string | null;
    profiles: { full_name: string | null } | null;
  } | null;
  post_metrics: MetricSnapshot[];
};

type ConversionRow = {
  creator_id: string | null;
  day: string;
  new_accounts: number;
  sales_cents: number;
};

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function asFormat(raw: string | null | undefined): ContentFormat {
  return raw === 'photo_carousel' ? 'photo_carousel' : 'video';
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** The day feed never starts later than this many days back. */
const WINDOW_DAYS = 84;
const PAGE = 500;

/** Every row of a query, read a page at a time: PostgREST stops at 1000 rows per request. */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  size = PAGE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
}

/**
 * Views gained per local day, from cumulative snapshots. Each platform row
 * keeps its own running high, so a snapshot that dips (a platform under-
 * reporting for a poll) neither hides growth nor counts it twice when the
 * number recovers. Gains land on the day of the snapshot that first saw them.
 */
export function viewsGainedByDay(posts: Pick<AnalyticsPost, 'series'>[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const post of posts) {
    for (const row of post.series) {
      let high = 0;
      for (const snap of row) {
        if (snap.views <= high) continue;
        const key = localDayKey(new Date(snap.t));
        byDay.set(key, (byDay.get(key) ?? 0) + snap.views - high);
        high = snap.views;
      }
    }
  }
  return byDay;
}

/** Views gained per local day for each post id (see viewsGainedByDay). */
function gainsByPost(posts: AnalyticsPost[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const post of posts) out.set(post.id, viewsGainedByDay([post]));
  return out;
}

const CREDIT_WINDOW_DAYS = 7;

/**
 * Credits each creator's coded sign-ups and sales to their posts. A day's
 * credit is split by the views each of the creator's live posts gained over
 * that day and the six before it (people buy a few days after watching); when
 * none gained views it goes to the creator's newest post. Credit for a
 * creator with no post yet stays on the creator only. Writes onto the posts.
 */
export function creditPosts(
  posts: AnalyticsPost[],
  creatorRows: { creator_id: string | null; day: string; new_accounts: number; sales_cents: number }[],
): void {
  const gains = gainsByPost(posts);
  const byCreator = new Map<string, AnalyticsPost[]>();
  for (const post of posts) {
    if (!post.creatorId) continue;
    const list = byCreator.get(post.creatorId) ?? [];
    list.push(post);
    byCreator.set(post.creatorId, list);
  }
  for (const row of creatorRows) {
    if (!row.creator_id || (row.new_accounts <= 0 && row.sales_cents <= 0)) continue;
    const live = (byCreator.get(row.creator_id) ?? []).filter((p) => p.day <= row.day);
    if (live.length === 0) continue;
    const [y, m, d] = row.day.split('-').map((n) => parseInt(n, 10));
    const windowKeys = Array.from({ length: CREDIT_WINDOW_DAYS }, (_, i) => localDayKey(new Date(y, m - 1, d - i)));
    let weights = live.map((p) => windowKeys.reduce((n, k) => n + (gains.get(p.id)?.get(k) ?? 0), 0));
    let total = weights.reduce((n, w) => n + w, 0);
    if (total <= 0) {
      const newest = live.reduce((a, b) => (b.day > a.day ? b : a));
      weights = live.map((p) => (p === newest ? 1 : 0));
      total = 1;
    }
    live.forEach((post, i) => {
      post.signups += (row.new_accounts * weights[i]) / total;
      post.salesCents += (row.sales_cents * weights[i]) / total;
    });
  }
}

/** The day the company started its first campaign on Noni (YYYY-MM-DD). */
export function firstCampaignDayOf(
  rows: Array<{ starts_on: string | null; created_at: string | null }>,
): string | null {
  let first: string | null = null;
  for (const row of rows) {
    const day = row.starts_on ?? row.created_at?.slice(0, 10) ?? null;
    if (day && (first === null || day < first)) first = day;
  }
  return first;
}

/** The local day the company's first post went live (YYYY-MM-DD). */
export function firstPostDayOf(
  rows: Array<{ posted_at: string | null; status: string | null }>,
): string | null {
  let first: string | null = null;
  for (const row of rows) {
    if (row.posted_at === null || row.status === 'failed') continue;
    const day = localDayKey(new Date(row.posted_at));
    if (first === null || day < first) first = day;
  }
  return first;
}

export async function fetchCompanyAnalytics(
  companyId: string,
): Promise<CompanyAnalytics> {
  // Posts carry no date filter: old posts still accrue views. posts has no
  // company column; RLS scopes it to the active company through the
  // assignment or task, and rows are checked against companyId again below in
  // case the active company changed mid-flight. Paged, because a busy company
  // passes PostgREST's 1000-row cap.
  const [postRows, conversionRows, ledgerRows, payoutsRes, campaignsRes, connectedRes, trackingRes] =
    await Promise.all([
    fetchAllRows<PostRow>((from, to) =>
      supabase
        .from('posts')
        .select(
          `id, platform, post_url, posted_at, status, assignment_id, task_id,
           assignments:assignment_id ( company_id, creator_id, brief_id, library_brief_id, briefs:brief_id ( title, format ), profiles:creator_id ( full_name ) ),
           content_tasks:task_id ( company_id, title, format, assigned_to, profiles!content_tasks_assigned_to_fkey ( full_name ) ),
           post_metrics ( views, likes, saves, comments, shares, fetched_at )`,
        )
        .neq('status', 'failed')
        .order('id')
        .range(from, to),
    ),
    fetchAllRows<ConversionRow>((from, to) =>
      supabase
        .from('conversion_daily')
        .select('id, creator_id, day, new_accounts, sales_cents')
        .eq('company_id', companyId)
        .order('day')
        .order('id')
        .range(from, to),
    ),
    fetchAllRows<{ post_id: string | null; amount_cents: number }>((from, to) =>
      supabase
        .from('wallet_ledger')
        .select('id, post_id, amount_cents')
        .eq('company_id', companyId)
        .eq('kind', 'bounty_credit')
        .order('id')
        .range(from, to),
    ),
    supabase
      .from('payouts')
      .select('amount_cents, created_at, completed_at')
      .eq('company_id', companyId)
      .eq('status', 'paid'),
    supabase
      .from('campaigns')
      .select('starts_on, created_at')
      .eq('company_id', companyId),
    supabase.rpc('stripe_connected_at'),
    supabase.rpc('signup_tracking_on'),
  ]);
  if (payoutsRes.error) throw payoutsRes.error;
  if (campaignsRes.error) throw campaignsRes.error;

  const rows = postRows.filter(
    (r) => (r.assignments?.company_id ?? r.content_tasks?.company_id) === companyId,
  );

  // Sign-ups and sales only count from the day the first post went live.
  const firstPostDay = firstPostDayOf(rows) ?? firstCampaignDayOf(campaignsRes.data ?? []);
  const counted = conversionRows.filter((r) => firstPostDay !== null && r.day >= firstPostDay);
  const conversions = counted.filter((r) => r.creator_id === null);
  const creatorConversions = counted.filter((r) => r.creator_id !== null);

  const earnedByPostId = new Map<string, number>();
  for (const entry of ledgerRows) {
    if (entry.post_id === null) continue;
    earnedByPostId.set(
      entry.post_id,
      (earnedByPostId.get(entry.post_id) ?? 0) + entry.amount_cents,
    );
  }

  // Fold platform rows into posts keyed on the shared assignment or task.
  const groups = new Map<string, { key: string; rows: PostRow[] }>();
  for (const row of rows) {
    if (row.posted_at === null) continue;
    const key = row.assignment_id ?? row.task_id ?? row.id;
    const group = groups.get(key) ?? { key, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const posts: AnalyticsPost[] = [];
  for (const group of groups.values()) {
    const first = group.rows[0];
    const title =
      first.assignments?.briefs?.title ?? first.content_tasks?.title ?? 'Post';
    const creatorName =
      first.assignments?.profiles?.full_name ??
      first.content_tasks?.profiles?.full_name ??
      'Creator';
    const creatorId =
      first.assignments?.creator_id ?? first.content_tasks?.assigned_to ?? null;
    const format = asFormat(
      first.assignments?.briefs?.format ?? first.content_tasks?.format,
    );

    let day = '9999-12-31';
    let postUrl: string | null = null;
    const series: ViewSnapshot[][] = [];
    const empty = (): PlatformStats => ({ views: 0, likes: 0, saves: 0, comments: 0, shares: 0 });
    const tiktok = empty();
    const instagram = empty();
    let earned = 0;

    for (const row of group.rows) {
      const rowDay = localDayKey(new Date(row.posted_at ?? ''));
      if (rowDay < day) day = rowDay;
      if (postUrl === null && row.post_url !== null) postUrl = row.post_url;
      earned += earnedByPostId.get(row.id) ?? 0;

      const snaps = row.post_metrics
        .filter((s): s is MetricSnapshot & { fetched_at: string } => s.fetched_at !== null)
        .sort(
          (a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime(),
        );
      series.push(
        snaps.map((s) => ({
          t: new Date(s.fetched_at ?? '').getTime(),
          views: s.views ?? 0,
        })),
      );

      const last = snaps[snaps.length - 1];
      const target = row.platform === 'instagram' ? instagram : tiktok;
      target.views += last?.views ?? 0;
      target.likes += last?.likes ?? 0;
      target.saves += last?.saves ?? 0;
      target.comments += last?.comments ?? 0;
      target.shares += last?.shares ?? 0;
    }

    posts.push({
      id: group.key,
      assignmentId: first.assignment_id,
      briefId: first.assignments?.brief_id ?? null,
      libraryBriefId: first.assignments?.library_brief_id ?? null,
      title,
      creatorId,
      creatorName,
      creatorFirst: creatorName.split(' ')[0],
      format,
      day,
      views: tiktok.views + instagram.views,
      signups: 0,
      salesCents: 0,
      earnedCents: earned,
      tiktok,
      instagram,
      postUrl,
      series,
    });
  }

  const conversionByDay = new Map<string, ConversionRow>();
  for (const row of conversions) conversionByDay.set(row.day, row);

  creditPosts(posts, creatorConversions);
  for (const post of posts) {
    post.signups = Math.round(post.signups * 10) / 10;
    post.salesCents = Math.round(post.salesCents);
  }
  const codedByDay = new Map<string, { signups: number; salesCents: number }>();
  const creatorSales = new Map<string, { signups: number; salesCents: number }>();
  for (const row of creatorConversions) {
    const day = codedByDay.get(row.day) ?? { signups: 0, salesCents: 0 };
    day.signups += row.new_accounts;
    day.salesCents += row.sales_cents;
    codedByDay.set(row.day, day);
    const who = creatorSales.get(row.creator_id ?? '') ?? { signups: 0, salesCents: 0 };
    who.signups += row.new_accounts;
    who.salesCents += row.sales_cents;
    creatorSales.set(row.creator_id ?? '', who);
  }

  const postIdsByDay = new Map<string, string[]>();
  for (const post of posts) {
    const list = postIdsByDay.get(post.day) ?? [];
    list.push(post.id);
    postIdsByDay.set(post.day, list);
  }

  // The feed runs from the first day anything happened (never fewer than
  // WINDOW_DAYS back) to today, so Month and All time add up over the whole
  // history rather than a fixed window.
  const gained = viewsGainedByDay(posts);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const windowStart = new Date(todayStart);
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1));
  let firstKey = localDayKey(windowStart);
  for (const key of gained.keys()) if (key < firstKey) firstKey = key;
  for (const post of posts) if (post.day < firstKey) firstKey = post.day;
  for (const row of conversions) if (row.day < firstKey) firstKey = row.day;
  const [fy, fm, fd] = firstKey.split('-').map((n) => parseInt(n, 10));

  const days: AnalyticsDay[] = [];
  for (let date = new Date(fy, fm - 1, fd); date <= todayStart; date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)) {
    const key = localDayKey(date);
    const conversion = conversionByDay.get(key);
    days.push({
      day: key,
      views: gained.get(key) ?? 0,
      signups: conversion?.new_accounts ?? 0,
      salesCents: conversion?.sales_cents ?? 0,
      codedSignups: codedByDay.get(key)?.signups ?? 0,
      codedSalesCents: codedByDay.get(key)?.salesCents ?? 0,
      postIds: postIdsByDay.get(key) ?? [],
    });
  }

  const sum = (list: AnalyticsDay[], pick: (d: AnalyticsDay) => number) =>
    list.reduce((n, d) => n + pick(d), 0);
  const last30 = days.slice(-30);
  const prev30 = days.slice(-60, -30);
  const weekAgo = localDayKey(new Date(Date.now() - 6 * DAY_MS));

  const totals: AnalyticsTotals = {
    views: posts.reduce((n, p) => n + p.views, 0),
    posts: posts.length,
    signups: conversions.reduce((n, c) => n + c.new_accounts, 0),
    viewsDeltaPct: pctDelta(
      sum(last30, (d) => d.views),
      sum(prev30, (d) => d.views),
    ),
    signupsDeltaPct: pctDelta(
      sum(last30, (d) => d.signups),
      sum(prev30, (d) => d.signups),
    ),
    postsThisWeek: posts.filter((p) => p.day >= weekAgo).length,
  };

  const payouts: PayoutDay[] = (payoutsRes.data ?? [])
    .map((p) => ({
      day: localDayKey(new Date(p.completed_at ?? p.created_at ?? '')),
      amountCents: p.amount_cents,
    }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  // The connect date is a courtesy read: a failure hides sales, never the views.
  // Either source counts: Stripe linked on the web, or the company's own app
  // reporting sign-ups.
  const stripeConnected = (!connectedRes.error && !!connectedRes.data) || (!trackingRes.error && trackingRes.data === true);
  return { posts, days, totals, payouts, stripeConnected, creatorSales };
}
