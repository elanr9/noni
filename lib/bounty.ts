// Bounty display values. Payouts are not wired until WP10 (Stripe); these
// drive the creator-facing "earn" line only. Keep the numbers here so WP10
// can swap in real per-task amounts without touching the UI.
export const BOUNTY_AMOUNT_USD = 20;
export const BOUNTY_VIEW_THRESHOLD = 5000;

export function bountyLabel(): string {
  const views =
    BOUNTY_VIEW_THRESHOLD >= 1000
      ? `${BOUNTY_VIEW_THRESHOLD / 1000}k`
      : `${BOUNTY_VIEW_THRESHOLD}`;
  return `$${BOUNTY_AMOUNT_USD} at ${views} views`;
}

export function recordTimeLabel(estimatedSeconds: number | null): string | null {
  if (!estimatedSeconds || estimatedSeconds <= 0) return null;
  if (estimatedSeconds < 60) return `~${estimatedSeconds} sec`;
  const mins = Math.round(estimatedSeconds / 60);
  return `~${mins} min`;
}
