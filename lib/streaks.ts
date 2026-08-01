import { supabase } from './supabase';
import type { Database, Json } from './types';

export type CreatorStreak =
  Database['public']['Tables']['creator_streaks']['Row'];

export type StreakMilestone = {
  days: number;
  amountCents: number;
};

export const DEFAULT_STREAK_MILESTONES: StreakMilestone[] = [
  { days: 7, amountCents: 1000 },
  { days: 14, amountCents: 2500 },
  { days: 30, amountCents: 7500 },
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
