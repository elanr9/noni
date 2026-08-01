import { supabase } from './supabase';

export type MetricKey = 'views' | 'likes' | 'comments' | 'shares';
export type RangeKey = '7D' | '30D' | '90D';

export const METRIC_KEYS: MetricKey[] = ['views', 'likes', 'comments', 'shares'];
export const RANGE_KEYS: RangeKey[] = ['7D', '30D', '90D'];
export const RANGE_DAYS: Record<RangeKey, number> = { '7D': 7, '30D': 30, '90D': 90 };

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
};

export type MetricSeries = {
  total: number;
  deltaLabel: string;
  series: number[];
};

export type AnalyticsSnapshot = {
  hasData: boolean;
  metrics: Record<RangeKey, Record<MetricKey, MetricSeries>>;
  split: { tiktokPct: number; instagramPct: number };
};

type MetricRow = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  fetched_at: string | null;
};

type PostRow = {
  id: string;
  platform: string | null;
  post_metrics: MetricRow[];
};

/** Big-number formatting per handoff §6.6 (copied verbatim). */
export function formatMetric(v: number): string {
  return v >= 1_000_000
    ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
    : v >= 1000
      ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
      : `${v}`;
}

function deltaLabel(first: number, last: number): string {
  const diff = last - first;
  if (first > 0) {
    const pct = Math.round((diff / first) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
  }
  return diff > 0 ? `+${formatMetric(diff)}` : '0%';
}

/** Latest snapshot per post taken at or before `cutoff`, or null. */
function snapshotAt(rows: MetricRow[], cutoff: number): MetricRow | null {
  let latest: MetricRow | null = null;
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

function buildRange(posts: PostRow[], days: number): Record<MetricKey, MetricSeries> {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const dayMs = 24 * 60 * 60 * 1000;

  const perDay: Record<MetricKey, number>[] = [];
  for (let i = 0; i < days; i++) {
    const cutoff = endOfToday.getTime() - (days - 1 - i) * dayMs;
    const totals: Record<MetricKey, number> = { views: 0, likes: 0, comments: 0, shares: 0 };
    for (const post of posts) {
      const snap = snapshotAt(post.post_metrics, cutoff);
      if (!snap) continue;
      for (const key of METRIC_KEYS) totals[key] += snap[key] ?? 0;
    }
    perDay.push(totals);
  }

  const result = {} as Record<MetricKey, MetricSeries>;
  for (const key of METRIC_KEYS) {
    const series = perDay.map((d) => d[key]);
    const first = series[0];
    const last = series[series.length - 1];
    result[key] = { total: last, deltaLabel: deltaLabel(first, last), series };
  }
  return result;
}

/** Views split by platform from each post's latest snapshot. Same for every range. */
function buildSplit(posts: PostRow[]): { tiktokPct: number; instagramPct: number } {
  let tiktok = 0;
  let instagram = 0;
  for (const post of posts) {
    const snap = snapshotAt(post.post_metrics, Date.now());
    if (!snap) continue;
    const views = snap.views ?? 0;
    if (post.platform === 'tiktok') tiktok += views;
    else if (post.platform === 'instagram') instagram += views;
  }
  const sum = tiktok + instagram;
  if (sum === 0) return { tiktokPct: 0, instagramPct: 0 };
  const tiktokPct = Math.round((tiktok / sum) * 100);
  return { tiktokPct, instagramPct: 100 - tiktokPct };
}

export async function fetchAnalytics(userId: string): Promise<AnalyticsSnapshot> {
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, platform, submissions!inner(creator_id), post_metrics(views, likes, comments, shares, fetched_at)',
    )
    .eq('submissions.creator_id', userId);

  if (error) throw error;
  const posts = (data ?? []) as unknown as PostRow[];

  const hasData = posts.some((post) => post.post_metrics.length > 0);

  return {
    hasData,
    metrics: {
      '7D': buildRange(posts, 7),
      '30D': buildRange(posts, 30),
      '90D': buildRange(posts, 90),
    },
    split: buildSplit(posts),
  };
}
