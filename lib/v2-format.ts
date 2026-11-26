/**
 * Numbers and dates for the v2 admin screens. One formatter each so every
 * figure in the app reads the same way (README rule: 3k, 3.4k, 10.5k, 1.4M).
 */

/** Under 1,000 as is; 1,000 to 999,999 with one decimal and no trailing .0; 1M and up as 1.4M. */
export function fmt(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

/** Payout money from cents: "$40", "$1,240", "$12.50". The only money formatter in the v2 apps. */
export function money(cents: number): string {
  const dollars = Math.round(cents) / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Sales from cents, short: "$840", "$1.2k", "$48.3k". Whole dollars under 1,000. */
export function sales(cents: number): string {
  return `$${fmt(cents / 100)}`;
}

/** A credited count, which a split can leave fractional: whole from 1 up, "<1" for a sliver, "0" for none. */
export function credit(n: number): string {
  return n > 0 && n < 1 ? '<1' : fmt(n);
}

/** "3 sign-ups", "1 sign-up", "<1 sign-up". */
export function signupsLabel(n: number): string {
  return `${credit(n)} ${n > 0 && Math.round(n) <= 1 ? 'sign-up' : 'sign-ups'}`;
}

/** What the viewer may see of sign-ups and sales: the source is connected and the company lets them. */
export type SalesView = { signups: boolean; sales: boolean };

/** "$840 sales · 3 sign-ups" from the parts the viewer may see that are above zero, or null with nothing to say. */
export function creditLine(view: SalesView, salesCents: number, signups: number): string | null {
  const parts = [view.sales && salesCents > 0 ? `${sales(salesCents)} sales` : null, view.signups && signups > 0 ? signupsLabel(signups) : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
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

/** "Oct 21": the day a post went live. */
export function postDate(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}
