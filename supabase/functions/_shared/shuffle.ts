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
  /** 'video' or 'photo_carousel'; drives the per-day format mix. */
  format: string;
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
 * The week's format sequence: one 'video' | 'slideshow' entry per open slot,
 * shuffled so the daily mix varies (some days 2 videos 1 slideshow, some
 * 1 and 2), then lightly rebalanced so no multi-slot day is all slideshows
 * while another day hoards videos. The week total keeps the pool's ratio.
 */
function buildFormatMix(params: {
  videosWanted: number;
  slidesWanted: number;
  capacities: readonly number[];
  seed: string;
}): string[] {
  const { videosWanted, slidesWanted, capacities, seed } = params;
  const mix = seededShuffle(
    [
      ...new Array<string>(videosWanted).fill('video'),
      ...new Array<string>(slidesWanted).fill('slideshow'),
    ],
    seed,
  );

  // Chunk boundaries follow each day's open capacity.
  const dayStart: number[] = [];
  let cursor = 0;
  for (const cap of capacities) {
    dayStart.push(cursor);
    cursor += cap;
  }
  const countVideos = (day: number): number => {
    let n = 0;
    const end = Math.min(dayStart[day] + capacities[day], mix.length);
    for (let i = dayStart[day]; i < end; i++) if (mix[i] === 'video') n += 1;
    return n;
  };
  const swapIn = (day: number, from: number) => {
    const end = Math.min(dayStart[day] + capacities[day], mix.length);
    const fromEnd = Math.min(dayStart[from] + capacities[from], mix.length);
    for (let i = dayStart[day]; i < end; i++) {
      if (mix[i] !== 'slideshow') continue;
      for (let j = dayStart[from]; j < fromEnd; j++) {
        if (mix[j] !== 'video') continue;
        [mix[i], mix[j]] = [mix[j], mix[i]];
        return;
      }
    }
  };
  for (let day = 0; day < capacities.length; day++) {
    if (capacities[day] < 2 || countVideos(day) > 0) continue;
    const donor = capacities.findIndex(
      (cap, d) => cap > 0 && countVideos(d) >= 2,
    );
    if (donor >= 0) swapIn(day, donor);
  }
  return mix;
}

/**
 * Lay out one creator's week. Pinned briefs land on their pinned day first,
 * then seeded shuffles fill the remaining slots three per day across seven
 * days with a randomized per-day format mix: the week keeps the campaign's
 * video-to-slideshow ratio, but which briefs land where, and each day's mix,
 * is randomized per creator. Whatever does not fit becomes the swap pool.
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

  const seed = campaignId + creatorId;
  const videos = seededShuffle(
    rest.filter((b) => b.format !== 'photo_carousel'),
    seed + ':video',
  );
  const slides = seededShuffle(
    rest.filter((b) => b.format === 'photo_carousel'),
    seed + ':slides',
  );

  const capacities = filled.map((n) => SLOTS_PER_DAY - n);
  const totalFree = capacities.reduce((sum, n) => sum + n, 0);
  const take = Math.min(rest.length, totalFree);
  // Week ratio mirrors the pool ratio, clamped to what each format can supply.
  let videosWanted = Math.round((take * videos.length) / Math.max(1, rest.length));
  videosWanted = Math.max(take - slides.length, Math.min(videosWanted, videos.length));
  const slidesWanted = take - videosWanted;

  const mix = buildFormatMix({
    videosWanted,
    slidesWanted,
    capacities,
    seed: seed + ':mix',
  });

  let cursor = 0;
  for (let day = 0; day < DAYS_PER_WEEK && cursor < mix.length; day++) {
    while (filled[day] < SLOTS_PER_DAY && cursor < mix.length) {
      const source = mix[cursor] === 'video' ? videos : slides;
      const brief = source.shift();
      cursor += 1;
      if (!brief) continue;
      slots.push({ brief_id: brief.brief_id, day, slot_index: filled[day] });
      filled[day] += 1;
    }
  }

  for (const leftover of [...videos, ...slides]) {
    pool.push(leftover.brief_id);
  }

  return { slots, pool };
}
