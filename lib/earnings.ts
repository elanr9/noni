/** Earnings math from design_handoff_creator_app/README.md §3.4 (placeholder payout model). */

export const CPM = 1.5;
export const TIER = 20;

export type Earnings = {
  /** Dollars earned so far. */
  earned: number;
  /** Next payout tier in dollars. */
  next: number;
  /** Views remaining to reach the next tier. */
  toGo: number;
};

export function earningsForViews(views: number): Earnings {
  const earned = (views / 1000) * CPM;
  const next = Math.floor(earned / TIER) * TIER + TIER;
  const toGo = Math.round(((next - earned) / CPM) * 1000);
  return { earned, next, toGo };
}

/** Number formatting from §6.6: 12.8k / 1.2M, plain below 1000. */
export function formatCount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return `${v}`;
}
