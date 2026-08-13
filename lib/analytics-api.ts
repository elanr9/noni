// Analytics explorer data. Engagement (views, likes, saves) comes from
// post_metrics snapshots, sign-ups and sales from conversion_daily (synced
// from the FieldVision product DB), per-post earnings from wallet_ledger
// bounty credits, paid-out totals from payouts. Money surfaces are gated in
// the UI by the Stripe connect date: dollars exist only from that day.

import type { ContentFormat } from './admin-review-types';
import { supabase } from './supabase';

export type ViewSnapshot = { t: number; views: number };

export type PlatformStats = { views: number; likes: number; saves: number };

/**
 * One piece of content. Platform rows (TikTok + Instagram) that share an
 * assignment or task are folded into a single post.
 */
export type AnalyticsPost = {
  id: string;
  title: string;
  creatorId: string | null;
  creatorName: string;
  creatorFirst: string;
  format: ContentFormat;
  /** Local calendar day the post went live, YYYY-MM-DD. */
  day: string;
  /** Total views across platforms, latest snapshots. */
  views: number;
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
  signups: number;
  salesCents: number;
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
  /** Last 84 days ascending (covers every chart range and the calendar). */
  days: AnalyticsDay[];
  totals: AnalyticsTotals;
  /** Completed creator payouts, ascending by day. */
  payouts: PayoutDay[];
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
    creator_id: string | null;
    briefs: { title: string | null; format: string | null } | null;
    profiles: { full_name: string | null } | null;
  } | null;
  content_tasks: {
    title: string | null;
    format: string | null;
    assigned_to: string | null;
    profiles: { full_name: string | null } | null;
  } | null;
  post_metrics: MetricSnapshot[];
};

type ConversionRow = {
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

const WINDOW_DAYS = 84;

export async function fetchCompanyAnalytics(
  companyId: string,
): Promise<CompanyAnalytics> {
  // Posts carry no date filter: old posts still accrue views inside the
  // window. RLS scopes them to the caller's company.
  const [postsRes, conversionsRes, ledgerRes, payoutsRes] = await Promise.all([
    supabase
      .from('posts')
      .select(
        `id, platform, post_url, posted_at, status, assignment_id, task_id,
         assignments:assignment_id ( creator_id, briefs:brief_id ( title, format ), profiles:creator_id ( full_name ) ),
         content_tasks:task_id ( title, format, assigned_to, profiles!content_tasks_assigned_to_fkey ( full_name ) ),
         post_metrics ( views, likes, saves, fetched_at )`,
      )
      .neq('status', 'failed'),
    supabase
      .from('conversion_daily')
      .select('day, new_accounts, sales_cents')
      .eq('company_id', companyId)
      .is('creator_id', null),
    supabase
      .from('wallet_ledger')
      .select('post_id, amount_cents')
      .eq('company_id', companyId)
      .eq('kind', 'bounty_credit'),
    supabase
      .from('payouts')
      .select('amount_cents, created_at, completed_at')
      .eq('company_id', companyId)
      .eq('status', 'paid'),
  ]);
  if (postsRes.error) throw postsRes.error;
  if (conversionsRes.error) throw conversionsRes.error;
  if (ledgerRes.error) throw ledgerRes.error;
  if (payoutsRes.error) throw payoutsRes.error;

  const rows = (postsRes.data ?? []) as unknown as PostRow[];
  const conversions = (conversionsRes.data ?? []) as ConversionRow[];

  const earnedByPostId = new Map<string, number>();
  for (const entry of ledgerRes.data ?? []) {
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
    const empty = (): PlatformStats => ({ views: 0, likes: 0, saves: 0 });
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
    }

    posts.push({
      id: group.key,
      title,
      creatorId,
      creatorName,
      creatorFirst: creatorName.split(' ')[0],
      format,
      day,
      views: tiktok.views + instagram.views,
      earnedCents: earned,
      tiktok,
      instagram,
      postUrl,
      series,
    });
  }

  const conversionByDay = new Map<string, ConversionRow>();
  for (const row of conversions) conversionByDay.set(row.day, row);

  const postIdsByDay = new Map<string, string[]>();
  for (const post of posts) {
    const list = postIdsByDay.get(post.day) ?? [];
    list.push(post.id);
    postIdsByDay.set(post.day, list);
  }

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1));
  windowStart.setHours(0, 0, 0, 0);

  const days: AnalyticsDay[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = new Date(windowStart.getTime() + i * DAY_MS);
    const endOfDay = date.getTime() + DAY_MS - 1;
    const key = localDayKey(date);
    let views = 0;
    for (const post of posts) {
      views += Math.max(
        0,
        viewsAt(post.series, endOfDay) - viewsAt(post.series, endOfDay - DAY_MS),
      );
    }
    const conversion = conversionByDay.get(key);
    days.push({
      day: key,
      views,
      signups: conversion?.new_accounts ?? 0,
      salesCents: conversion?.sales_cents ?? 0,
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

  return { posts, days, totals, payouts };
}
