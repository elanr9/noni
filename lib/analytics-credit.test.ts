import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { creditPosts, viewsGainedByDay, type AnalyticsPost } from './analytics-api';

const at = (day: string, hour = 12) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};

function post(id: string, creatorId: string, day: string, snaps: [string, number][]): AnalyticsPost {
  const stats = { views: 0, likes: 0, saves: 0, comments: 0, shares: 0 };
  return {
    id, assignmentId: id, briefId: null, libraryBriefId: null, title: id, creatorId, creatorName: creatorId, creatorFirst: creatorId,
    format: 'video', day, views: snaps.at(-1)?.[1] ?? 0, signups: 0, salesCents: 0, earnedCents: 0, tiktok: stats, instagram: stats, postUrl: null,
    series: [snaps.map(([d, views]) => ({ t: at(d), views }))],
  };
}

describe('viewsGainedByDay', () => {
  it('puts each gain on the day of the snapshot that saw it', () => {
    const p = post('a', 'c', '2026-11-01', [['2026-11-01', 100], ['2026-11-02', 250], ['2026-11-04', 400]]);
    const m = viewsGainedByDay([p]);
    expect(m.get('2026-11-01')).toBe(100);
    expect(m.get('2026-11-02')).toBe(150);
    expect(m.get('2026-11-03')).toBeUndefined();
    expect(m.get('2026-11-04')).toBe(150);
  });

  it('does not lose or double count growth around a snapshot that dips', () => {
    const p = post('a', 'c', '2026-11-01', [['2026-11-01', 100], ['2026-11-02', 40], ['2026-11-03', 130]]);
    const m = viewsGainedByDay([p]);
    expect([...m.values()].reduce((n, v) => n + v, 0)).toBe(130);
    expect(m.get('2026-11-03')).toBe(30);
  });
});

describe('creditPosts', () => {
  it('splits a creator day by the views each of their posts gained that week', () => {
    const a = post('a', 'maya', '2026-11-01', [['2026-11-01', 0], ['2026-11-05', 300]]);
    const b = post('b', 'maya', '2026-11-03', [['2026-11-03', 0], ['2026-11-05', 100]]);
    const other = post('x', 'jacob', '2026-11-01', [['2026-11-05', 9000]]);
    creditPosts([a, b, other], [{ creator_id: 'maya', day: '2026-11-06', new_accounts: 4, sales_cents: 8000 }]);
    expect(a.signups).toBe(3);
    expect(b.signups).toBe(1);
    expect(a.salesCents).toBe(6000);
    expect(b.salesCents).toBe(2000);
    expect(other.salesCents).toBe(0);
  });

  it('falls back to the newest live post, and never credits a post that was not live yet', () => {
    const old = post('old', 'maya', '2026-10-01', [['2026-10-01', 500]]);
    const recent = post('recent', 'maya', '2026-11-01', [['2026-11-01', 50]]);
    const later = post('later', 'maya', '2026-11-20', [['2026-11-20', 9000]]);
    creditPosts([old, recent, later], [{ creator_id: 'maya', day: '2026-11-15', new_accounts: 2, sales_cents: 5000 }]);
    expect(recent.salesCents).toBe(5000);
    expect(old.salesCents).toBe(0);
    expect(later.salesCents).toBe(0);
  });

  it('keeps every cent: the split adds back up to the creator total', () => {
    const posts = [1, 2, 3].map((n) => post(`p${n}`, 'maya', '2026-11-01', [['2026-11-02', n * 37]]));
    creditPosts(posts, [{ creator_id: 'maya', day: '2026-11-03', new_accounts: 5, sales_cents: 9999 }]);
    expect(posts.reduce((n, p) => n + p.salesCents, 0)).toBeCloseTo(9999, 6);
    expect(posts.reduce((n, p) => n + p.signups, 0)).toBeCloseTo(5, 6);
  });
});
