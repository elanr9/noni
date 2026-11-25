/**
 * Creator pay rules, as the creator sees them.
 *
 * These MUST match public.creator_pay_rates() (supabase migration 163), the
 * rates a post is paid at when its company has no campaign, and
 * noni-web/src/lib/creator-pay.ts. Change all three together. A company's
 * campaign carries its own rates (marketplace_listings, lib/marketplace.ts);
 * these are also what a new campaign starts with.
 *
 * A creator takes home $10 per video and $5 per slideshow once the post is
 * live and has 500 views, plus $1 for every full 1,000 views in the first 30
 * days, view pay capped at $300 per post. Payouts go to the creator's bank
 * every Sunday at 8 PM Eastern.
 */

export const VIDEO_POST_CENTS = 1000;
export const STATIC_POST_CENTS = 500;
export const CENTS_PER_1K_VIEWS = 100;
export const VIEW_PAY_CAP_CENTS = 30000;
/** A post earns its base pay once it has this many views. */
export const MIN_VIEWS_FOR_POST_PAY = 500;
export const VIEW_WINDOW_DAYS = 30;

export type PostKind = 'video' | 'static';

export function basePayCents(kind: PostKind): number {
  return kind === 'video' ? VIDEO_POST_CENTS : STATIC_POST_CENTS;
}

/** $1 per full 1,000 views, capped. */
export function viewPayCents(views: number): number {
  const thousands = Math.floor(Math.max(0, Number.isFinite(views) ? views : 0) / 1000);
  return Math.min(thousands * CENTS_PER_1K_VIEWS, VIEW_PAY_CAP_CENTS);
}

/** What one post pays the creator, in cents. */
export function postPayCents(kind: PostKind, views: number): number {
  return basePayCents(kind) + viewPayCents(views);
}
