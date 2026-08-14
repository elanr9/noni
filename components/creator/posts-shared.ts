import { earningsForViews } from '../../lib/earnings';
import { supabase } from '../../lib/supabase';
import type { TaskStatus } from '../../lib/tasks';
import {
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../lib/tasks-api';

/**
 * Shared derivations for the Posts surfaces (SCREENS §4). Every post lives
 * on both platforms; the 68/32 views split is the contract placeholder for
 * per-platform numbers until real per-platform metrics land.
 */

export const TIKTOK_SHARE = 0.68;
export const INSTAGRAM_SHARE = 0.32;

export const POSTED_STATUSES = new Set<TaskStatus>(['posted', 'approved']);

export function isPostedStatus(status: TaskStatus): boolean {
  return POSTED_STATUSES.has(status);
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Local date from a YYYY-MM-DD key. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Local-timezone YYYY-MM-DD. */
export function toDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** "2026-07-28" reads "28 Jul". */
export function shortDateLabel(key: string): string {
  const d = parseDayKey(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Monday of the week containing the given day key. */
export function weekStartKey(dateKey: string): string {
  const d = parseDayKey(dateKey);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return toDayKey(d);
}

/** "Jul 27 to Aug 2" from a week start key. */
export function weekRangeLabel(startKey: string): string {
  const start = parseDayKey(startKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} to ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}`;
}

export type WeekStatus = 'this' | 'paid' | 'upcoming';

export type CreatorWeek = {
  startKey: string;
  /** 1-based, oldest week in the queue window is 1. */
  index: number;
  rangeLabel: string;
  status: WeekStatus;
  items: AssignmentWithBrief[];
  views: number;
  likes: number;
  /** Dollars, CPM placeholder over posted views. */
  earned: number;
};

/**
 * Group the queue by Monday-start week, ascending. Totals count posted and
 * approved items only; earned uses the placeholder CPM math.
 */
export function groupWeeks(assignments: AssignmentWithBrief[]): CreatorWeek[] {
  const byStart = new Map<string, AssignmentWithBrief[]>();
  for (const a of assignments) {
    const key = weekStartKey(a.scheduled_date);
    const list = byStart.get(key) ?? [];
    list.push(a);
    byStart.set(key, list);
  }

  const thisWeek = weekStartKey(toDayKey(new Date()));
  const starts = [...byStart.keys()].sort();

  return starts.map((startKey, i) => {
    const items = (byStart.get(startKey) ?? []).sort((a, b) =>
      a.scheduled_date === b.scheduled_date
        ? a.slot_index - b.slot_index
        : a.scheduled_date.localeCompare(b.scheduled_date),
    );
    let views = 0;
    let likes = 0;
    for (const a of items) {
      if (!isPostedStatus(a.status)) continue;
      const m = parseAssignmentMetrics(a.metrics);
      views += m.views ?? 0;
      likes += m.likes ?? 0;
    }
    const status: WeekStatus =
      startKey === thisWeek ? 'this' : startKey < thisWeek ? 'paid' : 'upcoming';
    return {
      startKey,
      index: i + 1,
      rangeLabel: weekRangeLabel(startKey),
      status,
      items,
      views,
      likes,
      earned: earningsForViews(views).earned,
    };
  });
}

/**
 * Virality: views percentile across the queue's posted items. The map holds
 * "Top {n}%" values (rank over count, ceiled); rows show the green chip when
 * the value is 10 or under (virality at or past the 90th percentile).
 */
export function viralityTopPercents(
  assignments: AssignmentWithBrief[],
): Map<string, number> {
  const posted = assignments
    .filter((a) => isPostedStatus(a.status))
    .map((a) => ({ id: a.id, views: parseAssignmentMetrics(a.metrics).views ?? 0 }))
    .sort((a, b) => b.views - a.views);
  const out = new Map<string, number>();
  posted.forEach((p, i) => {
    out.set(p.id, Math.max(1, Math.ceil(((i + 1) / posted.length) * 100)));
  });
  return out;
}

/** Raw jsonb read for keys outside AssignmentMetrics (e.g. saves). */
export function rawMetricNumber(
  metrics: AssignmentWithBrief['metrics'],
  key: string,
): number | null {
  if (metrics === null || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return null;
  }
  const v = (metrics as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Saves from metrics when present, else the stable 4%-of-views placeholder. */
export function savesForViews(
  views: number,
  metrics: AssignmentWithBrief['metrics'],
): number {
  return rawMetricNumber(metrics, 'saves') ?? Math.round(views * 0.04);
}

/** Campaign names for week naming; falls back to "Week of {range}" upstream. */
export async function fetchCampaignNames(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name')
    .in('id', ids);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of data ?? []) out.set(row.id, row.name);
  return out;
}

/** Week display name: the week's campaign when one exists, else the range. */
export function weekName(
  week: CreatorWeek,
  campaignNames: Map<string, string>,
): string {
  for (const a of week.items) {
    if (a.campaign_id !== null) {
      const name = campaignNames.get(a.campaign_id);
      if (name !== undefined) return name;
    }
  }
  return `Week of ${week.rangeLabel}`;
}
