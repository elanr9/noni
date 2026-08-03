// Deterministic shuffle + weekly layout for campaign publish.
// Pure module: no Deno or Supabase imports, so it runs in edge functions
// and in vitest unchanged.

/** xmur3 string hash: turns an arbitrary seed string into a 32-bit int. */
function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG: deterministic stream of floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle seeded by a string. Same seed, same order. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type CampaignBrief = {
  brief_id: string;
  /** 0-6 offset from the campaign drop date, or null when not pinned. */
  pinned_day: number | null;
};

export type Slot = {
  brief_id: string;
  /** 0-6 offset from the campaign drop date. */
  day: number;
  /** 0-based position within the day. */
  slot_index: number;
};

export type CreatorWeek = {
  slots: Slot[];
  /** Briefs left unassigned: the creator's swap pool for the week. */
  pool: string[];
};

export const DAYS_PER_WEEK = 7;
export const SLOTS_PER_DAY = 3;

/**
 * Lay out one creator's week. Pinned briefs land on their pinned day first,
 * then the seeded shuffle fills remaining slots three per day across seven
 * days. Whatever does not fit becomes the swap pool.
 */
export function buildCreatorWeek(
  briefs: readonly CampaignBrief[],
  campaignId: string,
  creatorId: string,
): CreatorWeek {
  const filled: number[] = new Array(DAYS_PER_WEEK).fill(0);
  const slots: Slot[] = [];
  const pool: string[] = [];

  const pinned = briefs.filter((b) => b.pinned_day !== null);
  const rest = briefs.filter((b) => b.pinned_day === null);

  for (const brief of pinned) {
    const day = brief.pinned_day as number;
    if (day < 0 || day >= DAYS_PER_WEEK || filled[day] >= SLOTS_PER_DAY) {
      pool.push(brief.brief_id);
      continue;
    }
    slots.push({ brief_id: brief.brief_id, day, slot_index: filled[day] });
    filled[day] += 1;
  }

  const shuffled = seededShuffle(rest, campaignId + creatorId);
  let day = 0;
  for (const brief of shuffled) {
    while (day < DAYS_PER_WEEK && filled[day] >= SLOTS_PER_DAY) day += 1;
    if (day >= DAYS_PER_WEEK) {
      pool.push(brief.brief_id);
      continue;
    }
    slots.push({ brief_id: brief.brief_id, day, slot_index: filled[day] });
    filled[day] += 1;
  }

  return { slots, pool };
}
