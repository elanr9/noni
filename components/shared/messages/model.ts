import type { Tone } from '../../../theme/v2';

export type InboxDm = {
  id: string;
  name: string;
  photo: string | null;
  tone: Tone;
  online: boolean;
  /** Last message preview, "You: " prefixed when mine. */
  last: string;
  /** ISO time of the last message, null when the thread is empty. */
  lastAt: string | null;
  unread: number;
  kind: 'creator' | 'team';
};

export type InboxChannel = {
  id: string;
  /** "#everyone" */
  name: string;
  last: string;
  lastAt: string | null;
  unread: number;
};

export type InboxReview = { count: number; names: string[] };

export type InboxData = {
  dms: InboxDm[];
  channels: InboxChannel[];
  /** The blue review card; null when nothing waits or the viewer is a creator. */
  review: InboxReview | null;
};

export const INBOX_FILTERS = ['All', 'Unread', 'Creators', 'Team', 'Channels'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

/** "12m", "3h", "2d", "3w": the inbox row time. */
export function inboxAt(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, now - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9:12 AM" today, "Tue 9:12 AM" this week, "Oct 21" before that. */
export function bubbleAt(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  if (days < 7) return `${DAYS[d.getDay()]} ${time}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function unreadTotal(data: InboxData | null): number {
  if (!data) return 0;
  return data.dms.reduce((a, d) => a + d.unread, 0);
}
