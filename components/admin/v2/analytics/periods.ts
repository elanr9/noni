// Periods, chart points and scopes for the Analytics tab (ANALYTICS.md 1a).
// Pure functions over the device clock, the views-per-day feed and the live
// posts, so the screen only holds range, offset and the selected point.
import type { AnalyticsDay } from '../../../../lib/analytics-api';
import { addDays, DAY_LETTERS, DAY_NAMES, dayKey, fmtRange, MONTHS, MONTHS_SHORT, shortDate, sunday, today } from '../../../../lib/v2-format';
import type { V2Post } from '../../../../lib/v2-posts';

export type Range = 'week' | 'last' | 'month' | 'all';

export const RANGES: readonly { key: Range; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'last', label: 'Last week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
];

export type Period = {
  /** "This week", "Last month", "August", "All time". */
  label: string;
  /** "Oct 25 to 31", "October", "Since Aug 11". Equal to label when there is nothing to add. */
  dates: string;
  /** Inclusive start, exclusive end. */
  from: Date;
  to: Date;
  canBack: boolean;
  canFwd: boolean;
  chartTitle: string;
  emptyTop: string;
};

export type ChartPoint = {
  top: string;
  bottom: string;
  name: string;
  from: Date;
  to: Date;
  future: boolean;
  v: number;
};

/** Live posts only, newest first, never after today, the same post never twice (ANALYTICS.md 1c). */
export function scopedPosts(posts: V2Post[], now = today()): V2Post[] {
  const seen = new Set<string>();
  return posts
    .filter((p) => p.state === 'Posted' && p.date <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .filter((p) => {
      const k = `${p.title.trim().toLowerCase()}|${p.creatorId ?? p.creatorName}|${p.date.getTime()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function viewsByDay(days: AnalyticsDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of days) m.set(d.day, (m.get(d.day) ?? 0) + d.views);
  return m;
}

/** Sum of the day feed inside [from, to). */
export function viewsBetween(byDay: Map<string, number>, from: Date, to: Date): number {
  let n = 0;
  for (let d = new Date(from); d < to; d = addDays(d, 1)) n += byDay.get(dayKey(d)) ?? 0;
  return n;
}

/** The first day anything happened: the earliest day with views or the earliest live post. */
export function firstDate(days: AnalyticsDay[], posts: V2Post[], now = today()): Date {
  let first: Date | null = null;
  const consider = (d: Date) => {
    if (!first || d < first) first = d;
  };
  for (const d of days) if (d.views > 0) consider(new Date(`${d.day}T00:00:00`));
  for (const p of posts) consider(p.date);
  return first ?? now;
}

export function periodFor(range: Range, off: number, since: Date, now = today()): Period {
  if (range === 'all') {
    const from = new Date(since.getFullYear(), since.getMonth(), 1);
    return { label: 'All time', dates: `Since ${shortDate(since)}`, from, to: addDays(now, 1), canBack: false, canFwd: false, chartTitle: 'Views by month', emptyTop: 'No posts in this span' };
  }
  if (range === 'month') {
    const m = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const label = off === 0 ? 'This month' : off === -1 ? 'Last month' : MONTHS[m.getMonth()];
    const dates = `${MONTHS[m.getMonth()]}${m.getFullYear() !== now.getFullYear() ? ` ${m.getFullYear()}` : ''}`;
    return { label, dates, from: m, to: new Date(m.getFullYear(), m.getMonth() + 1, 1), canBack: off > -2, canFwd: off < 0, chartTitle: 'Views by week', emptyTop: 'No posts this month' };
  }
  const wOff = range === 'week' ? off : off - 1;
  const from = addDays(sunday(now), wOff * 7);
  const label = wOff === 0 ? 'This week' : wOff === -1 ? 'Last week' : `${-wOff} weeks ago`;
  return { label, dates: fmtRange(from, addDays(from, 6)), from, to: addDays(from, 7), canBack: wOff > -10, canFwd: wOff < 0, chartTitle: 'Views by day', emptyTop: 'No posts this week' };
}

export function chartPoints(range: Range, period: Period, byDay: Map<string, number>, now = today()): ChartPoint[] {
  if (range === 'all') {
    const pts: ChartPoint[] = [];
    for (let m = new Date(period.from); m <= now; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const to = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      pts.push({ top: String(m.getFullYear()), bottom: MONTHS_SHORT[m.getMonth()], name: MONTHS[m.getMonth()], from: m, to, future: false, v: viewsBetween(byDay, m, to) });
    }
    return pts;
  }
  if (range === 'month') {
    const m = period.from;
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    return Array.from({ length: 4 }, (_, i) => {
      const s = i * 7 + 1;
      const e = i === 3 ? last : s + 6;
      const from = new Date(m.getFullYear(), m.getMonth(), s);
      const to = new Date(m.getFullYear(), m.getMonth(), e + 1);
      return { top: `W${i + 1}`, bottom: `${s} to ${e}`, name: `${MONTHS_SHORT[m.getMonth()]} ${s} to ${e}`, from, to, future: from > now, v: viewsBetween(byDay, from, to) };
    });
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(period.from, i);
    return { top: DAY_LETTERS[i], bottom: String(d.getDate()), name: `${DAY_NAMES[i]} ${d.getDate()}`, from: d, to: addDays(d, 1), future: d > now, v: byDay.get(dayKey(d)) ?? 0 };
  });
}

export function postsBetween(posts: V2Post[], from: Date, to: Date): V2Post[] {
  return posts.filter((p) => p.date >= from && p.date < to);
}

export function byViews(posts: V2Post[]): V2Post[] {
  return posts.slice().sort((a, b) => b.views - a.views);
}
