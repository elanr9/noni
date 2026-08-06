// Company analytics: one time series with posting activity and conversion
// events on the same axis. Engagement comes from post_metrics snapshot deltas,
// conversions from conversion_daily (synced from the FieldVision product DB),
// revenue from conversion_daily when synced, else Noni's own revenue_events.

import { supabase } from './supabase';

export type SeriesMetricKey =
  | 'revenue'
  | 'views'
  | 'likes'
  | 'saves'
  | 'comments'
  | 'sales'
  | 'new_accounts'
  | 'free_trials';

export const SERIES_METRICS: { key: SeriesMetricKey; label: string; money?: boolean }[] = [
  { key: 'revenue', label: 'Revenue', money: true },
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'saves', label: 'Saves' },
  { key: 'comments', label: 'Comments' },
  { key: 'sales', label: 'Sales' },
  { key: 'new_accounts', label: 'New accounts' },
  { key: 'free_trials', label: 'Free trials' },
];

export type DayPost = {
  postId: string;
  platform: string | null;
  postUrl: string | null;
  title: string;
  creatorName: string;
  views: number;
};

export type CompanyDay = {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  posted: number;
  posts: DayPost[];
  metrics: Record<SeriesMetricKey, number>;
};

export type CompanyTimeSeries = {
  days: CompanyDay[];
  totals: Record<SeriesMetricKey, number>;
  /** False until sync-conversions has written rows; revenue then falls back
   * to Noni's own link-attributed revenue_events. */
  hasConversions: boolean;
};

type MetricSnapshot = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  fetched_at: string | null;
};

type PostRow = {
  id: string;
  platform: string | null;
  post_url: string | null;
  posted_at: string | null;
  status: string | null;
  assignments: {
    briefs: { title: string | null } | null;
    profiles: { full_name: string | null } | null;
  } | null;
  content_tasks: {
    title: string | null;
    profiles: { full_name: string | null } | null;
  } | null;
  post_metrics: MetricSnapshot[];
};

type ConversionRow = {
  day: string;
  new_accounts: number;
  free_trials: number;
  sales_count: number;
  sales_cents: number;
};

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Latest snapshot taken at or before `cutoff`, or null. */
function snapshotAt(rows: MetricSnapshot[], cutoff: number): MetricSnapshot | null {
  let latest: MetricSnapshot | null = null;
  let latestTime = -Infinity;
  for (const row of rows) {
    if (row.fetched_at === null) continue;
    const t = new Date(row.fetched_at).getTime();
    if (t <= cutoff && t > latestTime) {
      latest = row;
      latestTime = t;
    }
  }
  return latest;
}

function latestViews(rows: MetricSnapshot[]): number {
  return snapshotAt(rows, Date.now())?.views ?? 0;
}

const ENGAGEMENT_KEYS = ['views', 'likes', 'saves', 'comments'] as const;

function emptyMetrics(): Record<SeriesMetricKey, number> {
  return {
    revenue: 0,
    views: 0,
    likes: 0,
    saves: 0,
    comments: 0,
    sales: 0,
    new_accounts: 0,
    free_trials: 0,
  };
}

export async function fetchCompanyTimeSeries(
  companyId: string,
  rangeDays: number,
): Promise<CompanyTimeSeries> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (rangeDays - 1));
  windowStart.setHours(0, 0, 0, 0);
  const sinceIso = windowStart.toISOString();
  const sinceDay = localDayKey(windowStart);

  // Posts are fetched without a date filter: older posts still accrue views
  // inside the window and their deltas belong on the chart. RLS scopes them
  // to the caller's company (posts has no company_id column).
  const [postsRes, conversionsRes, revenueRes] = await Promise.all([
    supabase
      .from('posts')
      .select(
        `id, platform, post_url, posted_at, status,
         assignments:assignment_id ( briefs:brief_id ( title ), profiles:creator_id ( full_name ) ),
         content_tasks:task_id ( title, profiles!content_tasks_assigned_to_fkey ( full_name ) ),
         post_metrics ( views, likes, comments, saves, fetched_at )`,
      )
      .neq('status', 'failed'),
    supabase
      .from('conversion_daily')
      .select('day, new_accounts, free_trials, sales_count, sales_cents')
      .eq('company_id', companyId)
      .is('creator_id', null)
      .gte('day', sinceDay),
    supabase
      .from('revenue_events')
      .select('amount_cents, occurred_at')
      .eq('company_id', companyId)
      .gte('occurred_at', sinceIso),
  ]);
  if (postsRes.error) throw postsRes.error;
  if (conversionsRes.error) throw conversionsRes.error;
  if (revenueRes.error) throw revenueRes.error;

  const posts = (postsRes.data ?? []) as unknown as PostRow[];
  const conversions = (conversionsRes.data ?? []) as ConversionRow[];
  const hasConversions = conversions.length > 0;

  const conversionByDay = new Map<string, ConversionRow>();
  for (const row of conversions) conversionByDay.set(row.day, row);

  const revenueByDay = new Map<string, number>();
  for (const event of revenueRes.data ?? []) {
    if (!event.occurred_at) continue;
    const key = localDayKey(new Date(event.occurred_at));
    revenueByDay.set(
      key,
      (revenueByDay.get(key) ?? 0) + (event.amount_cents ?? 0),
    );
  }

  const postsByDay = new Map<string, DayPost[]>();
  for (const post of posts) {
    if (!post.posted_at) continue;
    const key = localDayKey(new Date(post.posted_at));
    const title =
      post.assignments?.briefs?.title ?? post.content_tasks?.title ?? 'Post';
    const creatorName =
      post.assignments?.profiles?.full_name ??
      post.content_tasks?.profiles?.full_name ??
      'Creator';
    const list = postsByDay.get(key) ?? [];
    list.push({
      postId: post.id,
      platform: post.platform,
      postUrl: post.post_url,
      title,
      creatorName,
      views: latestViews(post.post_metrics),
    });
    postsByDay.set(key, list);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const days: CompanyDay[] = [];
  const totals = emptyMetrics();

  for (let i = 0; i < rangeDays; i++) {
    const date = new Date(windowStart.getTime() + i * dayMs);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const key = localDayKey(date);

    const metrics = emptyMetrics();

    // Engagement delta: cumulative snapshot at end of day minus the day
    // before, summed across posts. Saves count null as zero.
    for (const post of posts) {
      const current = snapshotAt(post.post_metrics, endOfDay.getTime());
      if (!current) continue;
      const previous = snapshotAt(post.post_metrics, endOfDay.getTime() - dayMs);
      for (const metric of ENGAGEMENT_KEYS) {
        const now = current[metric] ?? 0;
        const before = previous?.[metric] ?? 0;
        metrics[metric] += Math.max(0, now - before);
      }
    }

    const conversion = conversionByDay.get(key);
    if (conversion) {
      metrics.sales = conversion.sales_count;
      metrics.new_accounts = conversion.new_accounts;
      metrics.free_trials = conversion.free_trials;
    }
    metrics.revenue = hasConversions
      ? (conversion?.sales_cents ?? 0)
      : (revenueByDay.get(key) ?? 0);

    const dayPosts = postsByDay.get(key) ?? [];
    for (const metric of SERIES_METRICS) {
      totals[metric.key] += metrics[metric.key];
    }
    days.push({ day: key, posted: dayPosts.length, posts: dayPosts, metrics });
  }

  return { days, totals, hasConversions };
}
