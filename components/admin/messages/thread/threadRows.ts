import { dayDividerLabel, sameCalendarDay } from '../DayDivider';
import { msgTimeLabel } from '../MsgRow';

/** What every thread row shares, whatever it carries. */
export type ThreadRowBase = {
  id: string;
  at: string;
  /** Null for system events (assigned, live) which render as Noni. */
  authorId: string | null;
  authorName: string;
};

export type ThreadListItem<T extends ThreadRowBase> =
  | { type: 'divider'; id: string; label: string }
  | { type: 'row'; id: string; item: T; collapsed: boolean; timeLabel: string };

/**
 * Sort rows by time, insert a day divider whenever the calendar day changes,
 * and collapse consecutive rows from the same author (no divider between).
 */
export function buildThreadItems<T extends ThreadRowBase>(
  rows: T[],
  now: Date = new Date(),
): ThreadListItem<T>[] {
  const sorted = [...rows].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const out: ThreadListItem<T>[] = [];
  let prev: T | null = null;
  for (const item of sorted) {
    let divided = false;
    if (prev === null || !sameCalendarDay(prev.at, item.at)) {
      out.push({ type: 'divider', id: `day:${item.at.slice(0, 10)}:${item.id}`, label: dayDividerLabel(item.at, now) });
      divided = true;
    }
    const collapsed = !divided && prev !== null && prev.authorId === item.authorId && item.authorId !== null;
    out.push({ type: 'row', id: item.id, item, collapsed, timeLabel: msgTimeLabel(item.at) });
    prev = item;
  }
  return out;
}
