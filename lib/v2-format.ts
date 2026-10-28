/**
 * Numbers, money and dates for the v2 admin screens. One formatter each so
 * every figure in the app reads the same way (README rule: 3k, 3.4k, 10.5k,
 * 1.4M; money() for payouts).
 */

/** Under 1,000 as is; 1,000 to 999,999 with one decimal and no trailing .0; 1M and up as 1.4M. */
export function fmt(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

/** Whole dollars with thousands separators: 1240 to "$1,240". */
export function money(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString('en-US')}`;
}

/** Cents to whole dollars. */
export function moneyCents(cents: number): string {
  return money(cents / 100);
}

/** Creator payout per live post, in dollars. */
export const PAYOUT_PER_POST = 40;

/** "$0.95": payout divided by views in thousands. */
export function perThousand(views: number, paid = PAYOUT_PER_POST): string {
  if (views <= 0) return '$0.00';
  return `$${(paid / (views / 1000)).toFixed(2)}`;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const DAY_MS = 864e5;

/** Midnight today on the device clock. */
export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The Sunday that starts the week holding `d`, at midnight. */
export function sunday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whole weeks between the week of `a` and the week of `b` (negative when `a` is earlier). */
export function weekOffset(a: Date, b: Date): number {
  return Math.round((sunday(a).getTime() - sunday(b).getTime()) / DAY_MS / 7);
}

/** "2026-10-23" for a local date. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight for a "YYYY-MM-DD" key. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "Oct 23". */
export function shortDate(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "Oct 25 to 31" or "Sep 28 to Oct 4". */
export function fmtRange(s: Date, e: Date): string {
  return s.getMonth() === e.getMonth()
    ? `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} to ${e.getDate()}`
    : `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} to ${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}`;
}

/** "Just now", "12m ago", "2h ago", "3d ago". */
export function ageLabel(ts: number, now = Date.now()): string {
  const s = Math.max(0, now - ts) / 1000;
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return shortDate(new Date(ts));
}

/** Clock readout "0:12" from seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
