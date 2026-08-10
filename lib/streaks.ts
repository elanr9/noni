import { supabase } from './supabase';
import type { Database, Json } from './types';

export type CreatorStreak =
  Database['public']['Tables']['creator_streaks']['Row'];

export type StreakMilestone = {
  days: number;
  amountCents: number;
};

export const DEFAULT_STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3, amountCents: 2000 },
  { days: 10, amountCents: 10000 },
  { days: 31, amountCents: 30000 },
];

export function parseStreakMilestones(
  settings: Json | null | undefined,
): StreakMilestone[] {
  const obj =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const raw = obj.streak_milestones;
  if (!Array.isArray(raw)) return DEFAULT_STREAK_MILESTONES;
  const parsed: StreakMilestone[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { days, amount_cents: amountCents } = item as Record<string, unknown>;
    if (
      typeof days === 'number' && Number.isInteger(days) && days > 0 &&
      typeof amountCents === 'number' && Number.isInteger(amountCents) && amountCents > 0
    ) {
      parsed.push({ days, amountCents });
    }
  }
  if (parsed.length === 0) return DEFAULT_STREAK_MILESTONES;
  return parsed.sort((a, b) => a.days - b.days);
}

export async function fetchMyStreak(
  companyId: string,
  creatorId: string,
): Promise<CreatorStreak | null> {
  const { data, error } = await supabase
    .from('creator_streaks')
    .select('*')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * The next milestone after the current streak. Past the largest configured
 * milestone the bonus repeats at every multiple of it (60, 90, ... days for
 * a 30 day milestone), matching the server payout logic.
 */
export function nextStreakMilestone(
  currentStreak: number,
  milestones: StreakMilestone[],
): StreakMilestone | null {
  const ahead = milestones.find((m) => m.days > currentStreak);
  if (ahead) return ahead;
  const last = milestones[milestones.length - 1];
  if (!last) return null;
  const nextMultiple = last.days * (Math.floor(currentStreak / last.days) + 1);
  return { days: nextMultiple, amountCents: last.amountCents };
}

export function streakBonusText(
  currentStreak: number,
  milestones: StreakMilestone[],
): string {
  const next = nextStreakMilestone(currentStreak, milestones);
  if (!next) return 'Post daily to build your streak';
  const dollars = next.amountCents / 100;
  const amount = Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
  const remaining = next.days - currentStreak;
  return `${amount} bonus in ${remaining} ${remaining === 1 ? 'day' : 'days'}`;
}

export type StreakRecordResult = {
  streak: number;
  bonus_cents: number;
  counted: boolean;
  near_milestone_days: number | null;
  near_milestone_cents: number | null;
};

function formatDollars(cents: number): string {
  const n = cents / 100;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** Push streak bonus / one-day-away progress after a day is counted. */
export function notifyStreakResult(
  creatorId: string,
  result: StreakRecordResult,
): void {
  if (!result.counted) return;
  if (result.bonus_cents > 0) {
    void supabase.functions.invoke('notify', {
      body: {
        creator_id: creatorId,
        event: 'streak_bonus',
        streak: result.streak,
        amount_cents: result.bonus_cents,
      },
    });
    return;
  }
  if (
    result.near_milestone_days != null &&
    result.near_milestone_cents != null &&
    result.near_milestone_cents > 0
  ) {
    void supabase.functions.invoke('notify', {
      body: {
        creator_id: creatorId,
        event: 'streak_progress',
        streak: result.streak,
        days: result.near_milestone_days,
        amount_cents: result.near_milestone_cents,
      },
    });
  }
}

export async function recordStreakDay(params: {
  companyId: string;
  creatorId: string;
  day: string;
}): Promise<StreakRecordResult | null> {
  const { data, error } = await supabase.rpc('record_streak_approval', {
    p_company: params.companyId,
    p_creator: params.creatorId,
    p_day: params.day,
  });
  if (error) {
    console.warn('record_streak_approval:', error.message);
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const result: StreakRecordResult = {
    streak: typeof row.streak === 'number' ? row.streak : 0,
    bonus_cents: typeof row.bonus_cents === 'number' ? row.bonus_cents : 0,
    counted: row.counted === true,
    near_milestone_days:
      typeof row.near_milestone_days === 'number'
        ? row.near_milestone_days
        : null,
    near_milestone_cents:
      typeof row.near_milestone_cents === 'number'
        ? row.near_milestone_cents
        : null,
  };
  notifyStreakResult(params.creatorId, result);
  return result;
}

export { formatDollars as formatStreakBonusCents };
