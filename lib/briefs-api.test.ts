import { describe, expect, it, vi } from 'vitest';

import {
  creatorBriefItems,
  parseOpen,
  parseSlides,
  parseStory,
  toBriefFormat,
  toMediaFormat,
  weekBriefFromRow,
  weekLanesFromItems,
  type BriefWithType,
  type Campaign,
  type CampaignBriefItem,
} from './briefs-api';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: globalThis.fetch }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

function briefRow(overrides: Partial<BriefWithType> = {}): BriefWithType {
  return {
    id: 'b1',
    company_id: 'c1',
    format: 'photo_carousel',
    title: 'Untitled post',
    hook: null,
    script: null,
    caption: null,
    example_url: null,
    example_transcript: null,
    why_it_works: null,
    created_by: null,
    archived_at: null,
    created_at: '2026-10-11T00:00:00Z',
    hook_options: [],
    talking_points: [],
    hashtags: [],
    search_phrase: null,
    point_count: null,
    target_words: 380,
    generation_id: null,
    post_type_id: null,
    cta: null,
    kill_reason: null,
    reviewed_at: null,
    review_result: null,
    text_overlay: {},
    subtitles: false,
    subtitles_y: 0.72,
    library_item_id: null,
    kind: null,
    slides: [],
    story: null,
    open: null,
    cta_feature_id: null,
    status: 'draft',
    creator_note: null,
    post_types: null,
    ...overrides,
  } as BriefWithType;
}

describe('format mapping', () => {
  it('maps db formats to media formats and back', () => {
    expect(toMediaFormat('photo_carousel')).toBe('slideshow');
    expect(toMediaFormat('video')).toBe('reel');
    expect(toBriefFormat('slideshow')).toBe('photo_carousel');
    expect(toBriefFormat('reel')).toBe('video');
  });
});

describe('parseSlides', () => {
  it('keeps valid slides and drops junk', () => {
    const slides = parseSlides([
      { role: 'cover', text: 'Hi', shot: 'Pitch', inset_feature_id: null },
      { role: 'cta', text: 'Plug', shot: '', inset_feature_id: 'f1', box: { x: 0.5, y: 0.6, w: 0.7 }, tstyle: { size: 0.8, align: 'left' } },
      { role: 'nope', text: 'x' },
      'string',
      null,
    ]);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toEqual({ role: 'cover', text: 'Hi', shot: 'Pitch', inset_feature_id: null });
    expect(slides[1].box).toEqual({ x: 0.5, y: 0.6, w: 0.7 });
    expect(slides[1].tstyle).toEqual({ size: 0.8, align: 'left' });
    expect(slides[1].inset_feature_id).toBe('f1');
  });

  it('returns an empty list for non arrays', () => {
    expect(parseSlides(null)).toEqual([]);
    expect(parseSlides({ role: 'cover' })).toEqual([]);
  });
});

describe('parseStory and parseOpen', () => {
  it('fills defaults', () => {
    expect(parseStory({ theme: 'My journey to D1', beats: ['Start', 3, 'End'] })).toEqual({
      theme: 'My journey to D1',
      beats: ['Start', 'End'],
      min: 2,
      max: 10,
    });
    expect(parseStory(null)).toBeNull();
    expect(parseOpen({ prompt: 'Anything', must: [{ id: 'plug', label: 'Mention Inkbound once', on: true }, { id: 1 }], min: 4 })).toEqual({
      prompt: 'Anything',
      must: [{ id: 'plug', label: 'Mention Inkbound once', on: true }],
      min: 4,
    });
  });
});

describe('weekBriefFromRow', () => {
  it('is null while the slot has no kind', () => {
    expect(weekBriefFromRow(briefRow())).toBeNull();
  });

  it('maps a filled row', () => {
    const brief = weekBriefFromRow(
      briefRow({
        kind: 'handheld',
        title: '5 tips',
        format: 'video',
        caption: 'Cap',
        search_phrase: 'tips',
        hashtags: ['a'],
        cta: 'Plug',
        cta_feature_id: 'f1',
        status: 'ready',
        post_types: { key: 'numbered_list', label: 'Numbered list' } as BriefWithType['post_types'],
      }),
    );
    expect(brief).toMatchObject({
      format: 'reel',
      kind: 'handheld',
      title: '5 tips',
      caption: 'Cap',
      searchTerm: 'tips',
      hashtags: ['a'],
      cta: { text: 'Plug', featureId: 'f1' },
      status: 'ready',
      postTypeKey: 'numbered_list',
      postTypeName: 'Numbered list',
    });
  });

  it('blanks the placeholder title', () => {
    expect(weekBriefFromRow(briefRow({ kind: 'open' }))?.title).toBe('');
  });
});

describe('weekLanesFromItems', () => {
  const campaign = { id: 'w1', company_id: 'c1' } as Campaign;
  const item = (id: string, format: string, position: number, kind: string | null = null): CampaignBriefItem =>
    ({
      campaign_id: 'w1',
      brief_id: id,
      company_id: 'c1',
      position,
      pinned_day: null,
      created_at: '',
      briefs: briefRow({ id, format, kind }),
    }) as CampaignBriefItem;

  it('splits stamped rows into numbered lanes per format', () => {
    const lanes = weekLanesFromItems(campaign, [
      item('r1', 'video', 0, 'handheld'),
      item('r2', 'video', 1),
      item('s1', 'photo_carousel', 2),
      item('s2', 'photo_carousel', 3, 'story'),
    ]);
    expect(lanes.reel.map((s) => [s.index, s.briefId, Boolean(s.brief)])).toEqual([
      [0, 'r1', true],
      [1, 'r2', false],
    ]);
    expect(lanes.slideshow.map((s) => [s.index, s.briefId, Boolean(s.brief)])).toEqual([
      [0, 's1', false],
      [1, 's2', true],
    ]);
  });

  it('skips archived rows', () => {
    const archived = item('r1', 'video', 0);
    archived.briefs.archived_at = '2026-01-01';
    expect(weekLanesFromItems(campaign, [archived]).reel).toEqual([]);
  });
});

describe('creatorBriefItems', () => {
  it('keeps briefs with a kind, sorted by day then slot', () => {
    const row = (id: string, day: string, slot: number, kind: string | null) =>
      ({ id, scheduled_date: day, slot_index: slot, status: 'assigned', briefs: briefRow({ id, kind }) }) as never;
    const items = creatorBriefItems([
      row('a', '2026-10-13', 2, 'handheld'),
      row('b', '2026-10-13', 0, 'story'),
      row('c', '2026-10-12', 5, null),
      row('d', '2026-10-12', 1, 'open'),
    ]);
    expect(items.map((i) => i.assignmentId)).toEqual(['d', 'b', 'a']);
    expect(items[0].brief.kind).toBe('open');
  });
});
