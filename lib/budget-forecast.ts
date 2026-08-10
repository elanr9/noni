/**
 * Monthly UGC budget → revenue forecast for the admin billing UI.
 *
 * Cadence / hit-rate from files/ugc-bible.md Part 10 and hit-rate note:
 * - Testing cadence ≈ 2.5 posts/creator/day average
 * - Hit rate ≈ 1 in 10 posts
 * Default bounty: $20 @ 5k views (lib/bounty.ts DEFAULT_BOUNTY_*)
 *
 * Revenue assumptions (bible has no $; research defaults for FieldVision-style
 * consumer SaaS / sports recruiting app prediction UI only):
 * - 0.15% of qualifying hit views → free trials
 * - 25% of trials → paid
 * - $29.99 first-month revenue per paid convert
 */

export type BudgetForecast = {
  max_bounty_hits: number;
  expected_hits: number;
  expected_posts: number;
  expected_qualifying_views: number;
  expected_trials: number;
  expected_paid: number;
  expected_revenue_cents: number;
  expected_creator_payout_cents: number;
  expected_roas: number;
  summary: string;
};

const HIT_RATE = 0.1;
const TRIAL_CONVERSION = 0.0015;
const PAID_CONVERSION = 0.25;
const FIRST_MONTH_CENTS = 2999;

function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function formatRoas(roas: number): string {
  if (!Number.isFinite(roas) || roas <= 0) return '0x';
  return `${roas.toFixed(roas >= 10 ? 0 : 1)}x`;
}

/**
 * Forecast expected bounty spend, trials, and first-month revenue from a
 * monthly budget and bounty settings.
 */
export function forecastMonthlyBudget(
  budgetCents: number,
  bountyAmountCents: number,
  threshold: number,
): BudgetForecast {
  const budget = Math.max(0, Math.floor(budgetCents));
  const bounty = bountyAmountCents > 0 ? bountyAmountCents : 1;
  const viewThreshold = Math.max(0, threshold);

  const expectedHits = budget / bounty;
  const maxBountyHits = Math.floor(budget / bounty);
  const expectedPosts = expectedHits / HIT_RATE;
  const expectedQualifyingViews = expectedHits * viewThreshold;
  const expectedTrials = expectedQualifyingViews * TRIAL_CONVERSION;
  const expectedPaid = expectedTrials * PAID_CONVERSION;
  const expectedRevenueCents = Math.round(expectedPaid * FIRST_MONTH_CENTS);
  const expectedRoas = budget > 0 ? expectedRevenueCents / budget : 0;

  const summary =
    budget <= 0
      ? 'Set a monthly budget to see predicted trials and revenue from bounty hits.'
      : `At ${formatDollars(budget)}/month, expect about ${expectedHits.toFixed(1)} bounty hits (~${Math.round(expectedPosts)} posts at a 1-in-10 hit rate), ~${Math.round(expectedTrials)} free trials, and ~${formatDollars(expectedRevenueCents)} first-month revenue (${formatRoas(expectedRoas)} ROAS).`;

  return {
    max_bounty_hits: maxBountyHits,
    expected_hits: expectedHits,
    expected_posts: expectedPosts,
    expected_qualifying_views: expectedQualifyingViews,
    expected_trials: expectedTrials,
    expected_paid: expectedPaid,
    expected_revenue_cents: expectedRevenueCents,
    expected_creator_payout_cents: budget,
    expected_roas: expectedRoas,
    summary,
  };
}

/** @deprecated Use forecastMonthlyBudget — same math, monthly wording. */
export function forecastWeeklyBudget(
  budgetCents: number,
  bountyAmountCents: number,
  threshold: number,
): BudgetForecast {
  return forecastMonthlyBudget(budgetCents, bountyAmountCents, threshold);
}
