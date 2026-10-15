import { describe, expect, it, vi } from 'vitest';

import { applySlidesVariant, type WeekBrief } from './briefs-api';
import { creatorSlides } from '../components/creator/briefs/model';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: globalThis.fetch }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, Easing: { bezier: () => () => 0 } }));

const slide = (role: 'cover' | 'point' | 'cta', text: string) => ({ role, text, shot: '', inset_feature_id: null });

const brief = {
  id: 'b',
  companyId: 'c',
  format: 'slideshow',
  kind: 'handheld',
  postTypeId: null,
  postTypeKey: 'numbered_tips',
  postTypeName: null,
  title: '4 tips for your highlight video',
  caption: '',
  searchTerm: '',
  hashtags: [],
  slides: [
    slide('cover', '4 tips for your highlight video'),
    slide('point', '1. Best clip first\nCoaches decide fast.'),
    slide('point', '2. Under 4 minutes\nThey watch 40 a night.'),
    slide('cta', '3. Let it cut your film\nI use FieldVision for my clips.'),
    slide('point', '4. Name and grad year first\nSo they can find you.'),
  ],
  story: null,
  open: null,
  cta: { text: '3. Let it cut your film', featureId: null },
  creatorNote: null,
  status: 'ready',
} as unknown as WeekBrief;

describe('applySlidesVariant', () => {
  it('lays this creator wording over the brief by index', () => {
    const out = applySlidesVariant(brief, [{ text: 'Four fixes for your highlight video' }, null, { text: '2. Keep it under 4 minutes\nCoaches watch 40 a night.' }, null, null]);
    expect(out.slides[0].text).toBe('Four fixes for your highlight video');
    expect(out.slides[1].text).toBe(brief.slides[1].text);
    expect(out.slides[2].text).toContain('Keep it under 4');
  });

  it('keeps the brief when the variant does not line up', () => {
    expect(applySlidesVariant(brief, [{ text: 'x' }])).toBe(brief);
    expect(applySlidesVariant(brief, null)).toBe(brief);
  });
});

describe('creatorSlides', () => {
  it('keeps steps in order and the CTA where the manager put it', () => {
    const out = creatorSlides(brief.slides, false);
    expect(out.map((s) => s.text.split('\n')[0])).toEqual(['4 tips for your highlight video', '1. Best clip first', '2. Under 4 minutes', '3. Let it cut your film', '4. Name and grad year first']);
  });

  it('shuffles order free points, keeps the CTA slot, renumbers', () => {
    for (let k = 0; k < 20; k++) {
      const out = creatorSlides(brief.slides, true);
      expect(out[3].role).toBe('cta');
      expect(out.slice(1).map((s) => s.text.match(/^\d+/)?.[0])).toEqual(['1', '2', '3', '4']);
    }
  });
});
