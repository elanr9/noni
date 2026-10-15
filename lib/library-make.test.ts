import { describe, expect, it, vi } from 'vitest';

import type { BriefWithType, Campaign, CampaignBriefItem } from './briefs-api';
import { parseMakeResult, type MakeResult } from './deck-ai';
import type { ReadyBrief } from './library-api';
import {
  activeStepIndex,
  firstEmptySlot,
  inputFromMake,
  isEmptySlotRow,
  makeSteps,
  normalizeReferenceUrl,
  openWeeks,
  pickTargetSlot,
  previewOf,
  slidesFromMake,
  studyState,
  type TargetSlot,
} from './library-make';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: globalThis.fetch }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, Easing: { bezier: () => () => 0 } }));

const made: MakeResult = {
  format: 'slideshow',
  postTypeId: 'tips',
  kind: 'handheld',
  cover: 'Questions to ask on your first call with a college coach',
  say: '',
  slides: [
    { role: 'cover', text: 'Questions to ask on your first call with a college coach', shot: 'Phone on the desk', featureId: null, place: null },
    { role: 'point', text: '1. How many players are you recruiting at my position', shot: 'Notebook', featureId: null, place: null },
    { role: 'cta', text: '2. I keep every coach call in Noni so I never ask twice', shot: 'Plain background', featureId: 'f1', place: 'end' },
  ],
  caption: 'First call with a college coach? Ask these. Noni keeps my notes, link in bio',
  hashtags: ['collegesoccer', 'recruiting', 'd1'],
  searchPhrase: 'questions to ask a college coach',
  sourceNote: 'Kept the question list',
  warnings: [],
};

describe('slidesFromMake', () => {
  it('keeps text and shot, insets the CTA feature with the editor CTA boxes and keeps its place', () => {
    const slides = slidesFromMake(made);
    expect(slides.map((s) => s.role)).toEqual(['cover', 'point', 'cta']);
    expect(slides[0]).toEqual({ role: 'cover', text: made.slides[0].text, shot: 'Phone on the desk', inset_feature_id: null });
    expect(slides[2].inset_feature_id).toBe('f1');
    expect(slides[2].box).toEqual({ x: 0.44, y: 0.22, w: 0.66 });
    expect(slides[2].inset_box_ig).toEqual({ x: 0.5, y: 0.6, w: 0.42 });
    expect(slides[2].place).toBe('end');
  });

  it('a CTA with no feature gets no boxes and defaults to any', () => {
    const slides = slidesFromMake({ slides: [made.slides[0], { ...made.slides[2], featureId: null, place: null }] });
    expect(slides[1].box).toBeUndefined();
    expect(slides[1].inset_feature_id).toBeNull();
    expect(slides[1].place).toBe('any');
  });
});

describe('inputFromMake', () => {
  it('is a handheld brief titled by the cover, with the CTA mirrored', () => {
    const input = inputFromMake(made, 'pt1');
    expect(input.kind).toBe('handheld');
    expect(input.postTypeId).toBe('pt1');
    expect(input.title).toBe(made.cover);
    expect(input.searchTerm).toBe('questions to ask a college coach');
    expect(input.hashtags).toEqual(['collegesoccer', 'recruiting', 'd1']);
    expect(input.cta).toEqual({ text: made.slides[2].text, featureId: 'f1' });
    expect(input.story).toBeNull();
  });
});

describe('parseMakeResult', () => {
  it('reads the server answer', () => {
    const out = parseMakeResult({
      format: 'reel',
      post_type_id: 'tips',
      cover: 'C',
      say: 'Said',
      slides: [
        { role: 'cover', text: 'C', shot: 'Said', feature_id: null },
        { role: 'point', text: 'P', shot: 'cue' },
        { role: 'cta', text: 'X', shot: 'y', feature_id: 'f', place: 'after_hook' },
      ],
      caption: 'cap',
      hashtags: ['a', 1],
      search_phrase: 's',
      source_note: 'n',
    });
    expect(out?.format).toBe('reel');
    expect(out?.slides[2]).toEqual({ role: 'cta', text: 'X', shot: 'y', featureId: 'f', place: 'after_hook' });
    expect(out?.hashtags).toEqual(['a']);
  });

  it('refuses an unknown type or a deck without a CTA', () => {
    expect(parseMakeResult({ format: 'slideshow', post_type_id: 'longtextx', slides: [] })).toBeNull();
    expect(parseMakeResult({ format: 'slideshow', post_type_id: 'tips', slides: [{ role: 'cover', text: 'a' }, { role: 'point', text: 'b' }] })).toBeNull();
  });
});

function slotRow(id: string, format: string, over: Partial<BriefWithType> = {}): CampaignBriefItem {
  return {
    campaign_id: 'w1',
    brief_id: id,
    briefs: {
      id,
      company_id: 'c1',
      format,
      kind: null,
      slides: [],
      talking_points: [],
      hook: null,
      script: null,
      kill_reason: null,
      archived_at: null,
      title: 'Untitled post',
      post_types: null,
      ...over,
    } as unknown as BriefWithType,
  } as unknown as CampaignBriefItem;
}

describe('isEmptySlotRow', () => {
  it('is empty only with nothing written by either editor', () => {
    expect(isEmptySlotRow(slotRow('a', 'video').briefs)).toBe(true);
    expect(isEmptySlotRow(slotRow('a', 'video', { kind: 'handheld' }).briefs)).toBe(false);
    expect(isEmptySlotRow(slotRow('a', 'video', { talking_points: [{ text: 'x' }] }).briefs)).toBe(false);
    expect(isEmptySlotRow(slotRow('a', 'video', { hook: 'Hook' }).briefs)).toBe(false);
    expect(isEmptySlotRow(slotRow('a', 'video', { kill_reason: 'no' }).briefs)).toBe(false);
  });
});

describe('firstEmptySlot', () => {
  const campaign = { id: 'w1', company_id: 'c1' } as Campaign;
  it('picks the first empty slot of the format in lane order', () => {
    const items = [
      slotRow('s1', 'photo_carousel', { kind: 'handheld' }),
      slotRow('r1', 'video'),
      slotRow('s2', 'photo_carousel', { talking_points: [{ text: 'old' }] }),
      slotRow('s3', 'photo_carousel'),
    ];
    const slot = firstEmptySlot(campaign, items, 'slideshow');
    expect(slot?.briefId).toBe('s3');
    expect(slot?.index).toBe(2);
    expect(firstEmptySlot(campaign, items, 'reel')?.briefId).toBe('r1');
    expect(firstEmptySlot(campaign, [items[0]], 'slideshow')).toBeNull();
  });
});

describe('pickTargetSlot', () => {
  const t = (id: string) => ({ campaign: { id } as Campaign, weekLabel: id, slot: { index: 0, briefId: id, format: 'reel', brief: null } }) as TargetSlot;
  it('none, one straight in, or a choice', () => {
    expect(pickTargetSlot([])).toEqual({ kind: 'none' });
    expect(pickTargetSlot([t('a')])).toEqual({ kind: 'one', target: t('a') });
    expect(pickTargetSlot([t('a'), t('b')]).kind).toBe('choose');
  });
});

describe('openWeeks', () => {
  it('keeps drafts and live weeks, drops finished ones, soonest first', () => {
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ago = (n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
    const weeks = openWeeks([
      { id: 'draft', status: 'draft', drop_date: ago(-7) } as Campaign,
      { id: 'live', status: 'published', drop_date: ago(2) } as Campaign,
      { id: 'done', status: 'published', drop_date: ago(30) } as Campaign,
    ]);
    expect(weeks.map((w) => [w.campaign.id, w.status])).toEqual([
      ['live', 'current'],
      ['draft', 'next'],
    ]);
  });
});

describe('study phases', () => {
  it('maps the study row to the live step', () => {
    expect(studyState(null)).toBe('reading');
    expect(studyState({ status: 'pending', phase: 'transcribing' })).toBe('transcribing');
    expect(studyState({ status: 'pending', phase: null })).toBe('reading');
    expect(studyState({ status: 'done', phase: null })).toBe('done');
    expect(studyState({ status: 'failed' })).toBe('failed');
  });

  it('steps follow the source and the active one moves with the phase', () => {
    const ref = makeSteps('reference', 'reading_slides');
    expect(ref.map((s) => s.label)).toEqual(['Reading the post', 'Reading the slides', 'Studying the structure', 'Writing ours']);
    expect(activeStepIndex(ref, 'studying')).toBe(2);
    expect(activeStepIndex(ref, 'saving')).toBe(3);
    expect(activeStepIndex(makeSteps('idea', 'saving'), 'saving')).toBe(1);
    for (const s of [...ref, ...makeSteps('reference', null), ...makeSteps('idea', null)]) expect(s.label).not.toMatch(/[-–—]/);
  });

  it('normalizes share links like the server', () => {
    expect(normalizeReferenceUrl('https://www.tiktok.com/@a/video/1/?is_from_webapp=1')).toBe('https://tiktok.com/@a/video/1');
  });
});

describe('previewOf', () => {
  const base = { id: 'b', title: 'T', hook: null, caption: null, talking_points: [], format: 'photo_carousel', post_type_id: null, kind: 'handheld', status: 'ready', why_it_works: null, post_types: null } as unknown as ReadyBrief;
  it('cover and the first three body lines from slides', () => {
    const p = previewOf({
      ...base,
      slides: [
        { role: 'cover', text: 'Cover\nline' },
        { role: 'point', text: '1. A' },
        { role: 'point', text: '2. B' },
        { role: 'cta', text: '3. C' },
        { role: 'point', text: '4. D' },
      ],
    } as ReadyBrief);
    expect(p).toEqual({ cover: 'Cover line', lines: ['1. A', '2. B', '3. C'] });
  });

  it('falls back to talking points on old posts', () => {
    const p = previewOf({ ...base, kind: null, slides: [], talking_points: [{ text: 'one' }, { text: 'two' }] } as unknown as ReadyBrief);
    expect(p).toEqual({ cover: 'T', lines: ['one', 'two'] });
  });
});
