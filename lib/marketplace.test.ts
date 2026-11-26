import { describe, expect, it } from 'vitest';

import {
  BRAND_COLORS,
  DEFAULT_TERMS,
  MESSAGE_MAX,
  NO_FILTERS,
  applicantStatLine,
  campaignTodo,
  coverColor,
  isLightColor,
  payHeadline,
  payLines,
  paySub,
  postsPerDayLabel,
  groupCampaigns,
  activeFilterCount,
  ageBandKey,
  birthYearFromAge,
  creatorFactLine,
  dayLabel,
  isFullName,
  matchesFilters,
  mergeThread,
  messageBody,
  missingToApply,
  orderFeed,
  sortCreators,
  spotsLabel,
  standing,
  unreadByApplication,
  type FeedListing,
  type MarketCreator,
} from './marketplace';
import { PREVIEW_CAMPAIGNS, PREVIEW_CREATORS, PREVIEW_FEED, PREVIEW_MESSAGES, PREVIEW_RESUME, previewThread } from './marketplace-preview';

const [maya, devon, priya, jordan] = PREVIEW_CREATORS as [MarketCreator, MarketCreator, MarketCreator, MarketCreator];

describe('creator filters', () => {
  it('passes everyone with no filters', () => {
    expect(PREVIEW_CREATORS.every((c) => matchesFilters(c, NO_FILTERS))).toBe(true);
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
  });
  it('filters by niche, gender, age, views, earned and followers', () => {
    expect(matchesFilters(jordan, { ...NO_FILTERS, niches: ['education'] })).toBe(false);
    expect(matchesFilters(maya, { ...NO_FILTERS, niches: ['education'], gender: 'female', minAge: 21, maxAge: 24 })).toBe(true);
    expect(matchesFilters(priya, { ...NO_FILTERS, minAge: 21, maxAge: 24 })).toBe(false);
    expect(matchesFilters(priya, { ...NO_FILTERS, minViews: 10_000 })).toBe(false);
    expect(matchesFilters(devon, { ...NO_FILTERS, minEarnedCents: 100_000 })).toBe(false);
    expect(matchesFilters(jordan, { ...NO_FILTERS, minFollowers: 100_000, minEarnedCents: 100_000 })).toBe(true);
  });
  it('leaves out a creator with no age when an age band is set', () => {
    expect(matchesFilters({ ...maya, age: null }, { ...NO_FILTERS, minAge: 18, maxAge: 20 })).toBe(false);
  });
  it('counts each kind of filter once', () => {
    expect(activeFilterCount({ ...NO_FILTERS, niches: ['a', 'b'], minAge: 18, maxAge: 20, gender: 'male' })).toBe(3);
    expect(ageBandKey({ minAge: 25, maxAge: 34 })).toBe('25-34');
    expect(ageBandKey({ minAge: null, maxAge: null })).toBe('any');
  });
});

describe('sorting', () => {
  it('orders by the chosen number', () => {
    expect(sortCreators(PREVIEW_CREATORS, 'match')[0].creator_id).toBe(maya.creator_id);
    expect(sortCreators(PREVIEW_CREATORS, 'views')[0].creator_id).toBe(jordan.creator_id);
    expect(sortCreators(PREVIEW_CREATORS, 'earned').map((c) => c.creator_id)).toEqual(['c4', 'c1', 'c2', 'c3']);
    expect(sortCreators(PREVIEW_CREATORS, 'followers')[0].creator_id).toBe(jordan.creator_id);
  });
});

describe('signing rules', () => {
  it('needs a first and a last name', () => {
    expect(isFullName('Maya')).toBe(false);
    expect(isFullName('  Maya   Torres ')).toBe(true);
    expect(isFullName('M')).toBe(false);
  });
  it('says what a profile lacks before applying', () => {
    expect(missingToApply(PREVIEW_RESUME)).toEqual([]);
    expect(missingToApply(null)).toEqual(['your age', 'your TikTok or Instagram']);
    expect(missingToApply({ ...PREVIEW_RESUME, birth_year: null })).toEqual(['your age']);
  });
  it('turns an age into a birth year', () => {
    expect(birthYearFromAge(21, new Date(2026, 10, 20))).toBe(2005);
  });
});

describe('feed', () => {
  const feed = PREVIEW_FEED as FeedListing[];
  it('puts invites first, then the closest niche fit', () => {
    const ordered = orderFeed(feed);
    expect(ordered[0].application_status).toBe('invited');
    expect(ordered[1].id).toBe('l1');
  });
  it('labels where the creator stands', () => {
    expect(standing(feed[0])).toBeNull();
    expect(standing(feed[1])?.label).toBe('Invited you');
    expect(standing(feed[2])?.label).toBe('Applied');
    expect(standing({ application_status: null, is_member: true })?.label).toBe('You are in');
  });
  it('labels spots', () => {
    expect(spotsLabel({ spots: null, spots_left: null })).toBeNull();
    expect(spotsLabel({ spots: 5, spots_left: 1 })).toBe('1 spot left');
    expect(spotsLabel({ spots: 5, spots_left: 0 })).toBe('Full');
  });
  it('reads a date-only string as a local day', () => {
    expect(dayLabel('2026-11-24')).toBe('Tue, Nov 24');
    expect(dayLabel(null)).toBeNull();
  });
  it('writes the fact line from what is known', () => {
    expect(creatorFactLine({ age: 21, gender: 'female', location: 'Austin, TX' })).toBe('21 · Female · Austin, TX');
    expect(creatorFactLine({ age: null, gender: 'undisclosed', location: null })).toBe('');
  });
});

describe('groupCampaigns', () => {
  it('splits active, applied and past, with work first and invites leading', () => {
    const g = groupCampaigns(PREVIEW_CAMPAIGNS);
    expect(g.active.map((c) => c.company_name)).toEqual(['Inkbound AI', 'FieldVision', 'socialcrumbs']);
    expect(g.applied.map((c) => c.kind)).toEqual(['invited', 'applied']);
    expect(g.past).toHaveLength(1);
  });

  it('says what is waiting, or nothing when caught up', () => {
    expect(campaignTodo({ to_make: 2, to_fix: 1, unread: 0, in_review: 3 }).map((t) => t.label)).toEqual(['2 to make', '1 to fix']);
    expect(campaignTodo({ to_make: 0, to_fix: 0, unread: 0, in_review: 0 })).toEqual([]);
  });
});

describe('campaign terms', () => {
  it('labels posts a day', () => {
    expect(postsPerDayLabel({ posts_per_day_min: 2, posts_per_day_max: 3 })).toBe('2 to 3 posts a day');
    expect(postsPerDayLabel({ posts_per_day_min: 1, posts_per_day_max: 1 })).toBe('1 post a day');
    expect(postsPerDayLabel({ posts_per_day_min: 3, posts_per_day_max: 3 })).toBe('3 posts a day');
    expect(postsPerDayLabel({ posts_per_day_min: 4, posts_per_day_max: 2 })).toBe('4 posts a day');
  });
  it('writes the pay pills', () => {
    expect(payHeadline(DEFAULT_TERMS)).toBe('$10/video');
    expect(paySub(DEFAULT_TERMS)).toBe('+$1/1k views');
    expect(payHeadline({ video_post_cents: 1250 })).toBe('$12.50/video');
    expect(paySub({ cents_per_1k_views: 150, view_pay_cap_cents: 20000 })).toBe('+$1.50/1k views');
    expect(paySub({ cents_per_1k_views: 100, view_pay_cap_cents: 0 })).toBeNull();
  });
  it('lists the pay terms without trailing zeros', () => {
    expect(payLines(DEFAULT_TERMS)).toEqual(['$10 a video', '$5 a slideshow', 'Paid at 500 views', '$1 per 1,000 views', 'Up to $300 view pay a post']);
    expect(payLines({ video_post_cents: 2500, static_post_cents: 750, cents_per_1k_views: 250, view_pay_cap_cents: 100000, min_views: 1500 })).toEqual([
      '$25 a video',
      '$7.50 a slideshow',
      'Paid at 1,500 views',
      '$2.50 per 1,000 views',
      'Up to $1,000 view pay a post',
    ]);
  });
  it('leaves out what does not apply', () => {
    expect(payLines({ ...DEFAULT_TERMS, min_views: 0, view_pay_cap_cents: 0 })).toEqual(['$10 a video', '$5 a slideshow']);
  });
  it('gives every preview campaign its own terms', () => {
    expect(PREVIEW_FEED.map(payHeadline)).toEqual(['$10/video', '$25/video', '$15/video', '$12.50/video']);
    expect(PREVIEW_FEED.map(postsPerDayLabel)).toEqual(['2 to 3 posts a day', '1 post a day', '3 posts a day', '2 to 3 posts a day']);
  });
});

describe('cover colour', () => {
  it('falls back to the first swatch', () => {
    expect(coverColor(null)).toBe(BRAND_COLORS[0]);
    expect(coverColor('blue')).toBe(BRAND_COLORS[0]);
    expect(coverColor('#0d9488')).toBe('#0D9488');
  });
  it('puts white on every swatch and ink on a light colour', () => {
    expect(BRAND_COLORS.some(isLightColor)).toBe(false);
    expect(isLightColor('#FFE066')).toBe(true);
    expect(isLightColor('#FFFFFF')).toBe(true);
  });
});

describe('applicant line', () => {
  it('joins the numbers a creator has', () => {
    expect(applicantStatLine(maya)).toBe('24.6k followers · 842k views · 31 posts');
    expect(applicantStatLine({ followers: null, total_views: 0, posts_live: 0 })).toBe('New to Noni');
    expect(applicantStatLine({ followers: 3200, total_views: 0, posts_live: 1 })).toBe('3.2k followers · 1 post');
  });
});

describe('application messages', () => {
  it('trims a draft and refuses an empty one', () => {
    expect(messageBody('  hi there \n')).toBe('hi there');
    expect(messageBody('   ')).toBeNull();
    expect(messageBody('x'.repeat(MESSAGE_MAX + 50))).toHaveLength(MESSAGE_MAX);
  });
  it('keeps only applications with something unread', () => {
    expect(unreadByApplication([{ application_id: 'a', unread: 2 }, { application_id: 'b', unread: 0 }])).toEqual({ a: 2 });
    expect(unreadByApplication([])).toEqual({});
  });
  it('keeps the same list when a poll brings nothing new', () => {
    const next = PREVIEW_MESSAGES.map((m) => ({ ...m }));
    expect(mergeThread(PREVIEW_MESSAGES, next)).toBe(PREVIEW_MESSAGES);
    expect(mergeThread(null, next)).toBe(next);
    expect(mergeThread(PREVIEW_MESSAGES, next.slice(0, 3))).toHaveLength(3);
    const read = next.map((m) => ({ ...m, read_at: m.read_at ?? '2026-11-25T00:00:00Z' }));
    expect(mergeThread(PREVIEW_MESSAGES, read)).toBe(read);
  });
  it('shows the preview thread from either side, newest last', async () => {
    const company = previewThread('company');
    const creator = previewThread('creator');
    expect((await company.load()).map((m) => m.mine)).toEqual((await creator.load()).map((m) => !m.mine));
    const sent = await creator.send('See you Monday');
    expect(sent).toMatchObject({ mine: true, from_company: false, body: 'See you Monday' });
    expect((await creator.load()).at(-1)).toBe(sent);
  });
});
