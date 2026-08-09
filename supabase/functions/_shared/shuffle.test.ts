import { describe, expect, it } from 'vitest';
import {
  buildCreatorWeek,
  type CampaignBrief,
  seededShuffle,
} from './shuffle';

const ids = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `brief-${i}`);

const briefs = (n: number, pins: Record<number, number> = {}): CampaignBrief[] =>
  ids(n).map((id, i) => ({
    brief_id: id,
    pinned_day: pins[i] ?? null,
    format: 'video',
  }));

/** The standard week pool: videos first, then slideshows. */
const mixedBriefs = (videos: number, slides: number): CampaignBrief[] => [
  ...ids(videos).map((id) => ({
    brief_id: `v-${id}`,
    pinned_day: null,
    format: 'video',
  })),
  ...ids(slides).map((id) => ({
    brief_id: `s-${id}`,
    pinned_day: null,
    format: 'photo_carousel',
  })),
];

describe('seededShuffle', () => {
  it('same seed gives the same order', () => {
    const items = ids(30);
    expect(seededShuffle(items, 'campaign-a' + 'creator-1')).toEqual(
      seededShuffle(items, 'campaign-a' + 'creator-1'),
    );
  });

  it('different seeds give different orders', () => {
    const items = ids(30);
    expect(seededShuffle(items, 'campaign-a' + 'creator-1')).not.toEqual(
      seededShuffle(items, 'campaign-a' + 'creator-2'),
    );
  });

  it('returns a permutation without mutating the input', () => {
    const items = ids(30);
    const copy = items.slice();
    const out = seededShuffle(items, 'seed');
    expect(items).toEqual(copy);
    expect(out.slice().sort()).toEqual(items.slice().sort());
  });
});

describe('buildCreatorWeek', () => {
  it('fills 21 slots, 3 per day, and leaves 9 in the pool from 30 briefs', () => {
    const { slots, pool } = buildCreatorWeek(briefs(30), 'camp', 'creator');
    expect(slots).toHaveLength(21);
    expect(pool).toHaveLength(9);
    for (let day = 0; day < 7; day++) {
      const daySlots = slots.filter((s) => s.day === day);
      expect(daySlots.map((s) => s.slot_index).sort()).toEqual([0, 1, 2]);
    }
  });

  it('is deterministic per campaign + creator', () => {
    const input = briefs(30, { 4: 2 });
    expect(buildCreatorWeek(input, 'camp', 'creator')).toEqual(
      buildCreatorWeek(input, 'camp', 'creator'),
    );
  });

  it('places pinned briefs on their pinned day', () => {
    const { slots } = buildCreatorWeek(briefs(30, { 0: 3, 1: 3, 2: 3 }), 'c', 'x');
    for (const id of ['brief-0', 'brief-1', 'brief-2']) {
      expect(slots.find((s) => s.brief_id === id)?.day).toBe(3);
    }
  });

  it('overflows a fourth pin on the same day into the pool', () => {
    const { slots, pool } = buildCreatorWeek(
      briefs(30, { 0: 3, 1: 3, 2: 3, 3: 3 }),
      'c',
      'x',
    );
    expect(pool).toContain('brief-3');
    expect(slots.filter((s) => s.day === 3)).toHaveLength(3);
  });

  it('never assigns the same brief twice and never overlaps slots', () => {
    const { slots } = buildCreatorWeek(briefs(30, { 5: 0, 9: 6 }), 'c', 'x');
    const briefIds = slots.map((s) => s.brief_id);
    expect(new Set(briefIds).size).toBe(briefIds.length);
    const positions = slots.map((s) => `${s.day}:${s.slot_index}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('assigns everything when there are fewer briefs than slots', () => {
    const { slots, pool } = buildCreatorWeek(briefs(10), 'c', 'x');
    expect(slots).toHaveLength(10);
    expect(pool).toHaveLength(0);
  });

  it('keeps the pool ratio: 20 videos + 10 slideshows fill 14 + 7', () => {
    const input = mixedBriefs(20, 10);
    const { slots } = buildCreatorWeek(input, 'camp', 'creator');
    const videos = slots.filter((s) => s.brief_id.startsWith('v-'));
    const slides = slots.filter((s) => s.brief_id.startsWith('s-'));
    expect(videos).toHaveLength(14);
    expect(slides).toHaveLength(7);
  });

  it('gives every full day at least one video and varies the daily mix', () => {
    const perDayVideoCounts = new Set<number>();
    for (const creator of ['a', 'b', 'c', 'd', 'e']) {
      const { slots } = buildCreatorWeek(mixedBriefs(20, 10), 'camp', creator);
      for (let day = 0; day < 7; day++) {
        const dayVideos = slots.filter(
          (s) => s.day === day && s.brief_id.startsWith('v-'),
        ).length;
        expect(dayVideos).toBeGreaterThanOrEqual(1);
        perDayVideoCounts.add(dayVideos);
      }
    }
    // Not every day is the same 2-videos-1-slideshow pattern.
    expect(perDayVideoCounts.size).toBeGreaterThan(1);
  });

  it('randomizes which briefs each creator gets', () => {
    const input = mixedBriefs(20, 10);
    const a = buildCreatorWeek(input, 'camp', 'creator-a');
    const b = buildCreatorWeek(input, 'camp', 'creator-b');
    expect(a.slots.map((s) => s.brief_id)).not.toEqual(
      b.slots.map((s) => s.brief_id),
    );
  });
});
