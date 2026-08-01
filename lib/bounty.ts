import { getCompany } from './onboarding';
import type { Json } from './types';

export const DEFAULT_BOUNTY_AMOUNT_CENTS = 2000;
export const DEFAULT_BOUNTY_VIEW_THRESHOLD = 5000;

export type BountySettings = {
  amountCents: number;
  viewThreshold: number;
};

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return fallback;
}

export function parseBountySettings(settings: Json | null | undefined): BountySettings {
  const obj =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return {
    amountCents: asPositiveInt(obj.bounty_amount_cents, DEFAULT_BOUNTY_AMOUNT_CENTS),
    viewThreshold: asPositiveInt(
      obj.bounty_view_threshold,
      DEFAULT_BOUNTY_VIEW_THRESHOLD,
    ),
  };
}

export async function fetchBountySettings(
  companyId: string,
): Promise<BountySettings> {
  const company = await getCompany(companyId);
  return parseBountySettings(company.settings);
}

export function bountyLabel(settings?: BountySettings): string {
  const { amountCents, viewThreshold } = settings ?? {
    amountCents: DEFAULT_BOUNTY_AMOUNT_CENTS,
    viewThreshold: DEFAULT_BOUNTY_VIEW_THRESHOLD,
  };
  const dollars = amountCents / 100;
  const amountText =
    Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  const views =
    viewThreshold >= 1000 && viewThreshold % 1000 === 0
      ? `${viewThreshold / 1000}k`
      : `${viewThreshold}`;
  return `${amountText} at ${views} views`;
}

export function recordTimeLabel(estimatedSeconds: number | null): string | null {
  if (!estimatedSeconds || estimatedSeconds <= 0) return null;
  if (estimatedSeconds < 60) return `~${estimatedSeconds} sec`;
  const mins = Math.round(estimatedSeconds / 60);
  return `~${mins} min`;
}
