import { describe, expect, it } from 'vitest';

import {
  NO_FILTERS,
  activeFilterCount,
  ageBandKey,
  birthYearFromAge,
  creatorFactLine,
  dayLabel,
  isFullName,
  matchesFilters,
  missingToApply,
  orderFeed,
  sortCreators,
  spotsLabel,
  standing,
  type FeedListing,
  type MarketCreator,
} from './marketplace';
import { PREVIEW_CREATORS, PREVIEW_FEED, PREVIEW_RESUME } from './marketplace-preview';

const [maya, devon, priya, jordan] = PREVIEW_CREATORS as [MarketCreator, MarketCreator, MarketCreator, MarketCreator];

describe('creator filters', () => {
  it('passes everyone with no filters', () => {
    expect(PREVIEW_CREATORS.every((c) => matchesFilters(c, NO_FILTERS))).toBe(true);
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
  });
  it('filters by niche, gender, age, views, earned and followers', () => {
    expect(matchesFilters(jordan, { ...NO_FILTERS, niches: ['school'] })).toBe(false);
    expect(matchesFilters(maya, { ...NO_FILTERS, niches: ['school'], gender: 'female', minAge: 21, maxAge: 24 })).toBe(true);
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
    expect(creatorFactLine({ age: 21, gender: 'female', location: 'Austin, TX' })).toBe('21 · Woman · Austin, TX');
    expect(creatorFactLine({ age: null, gender: 'undisclosed', location: null })).toBe('');
  });
});
