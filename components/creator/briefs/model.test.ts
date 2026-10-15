import { describe, expect, it, vi } from 'vitest';

import type { BriefSlide, WeekBrief } from '../../../lib/briefs-api';
import { briefSignature, buildSlides, creatorSlides, ctaMoves, ctaPlace, lockCta, mergeStaleDraft, moveCtaSlide, ownSlideLimits, renumber, slideBoxes, textLook } from './model';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, Easing: { bezier: () => () => 0 } }));

const slide = (role: 'cover' | 'point' | 'cta', text: string, extra: Partial<BriefSlide> = {}): BriefSlide => ({ role, text, shot: '', inset_feature_id: null, ...extra });

const tips = [
  slide('cover', '5 tips'),
  slide('point', 'Tip #1 Best clip first'),
  slide('point', '2) Under 4 minutes'),
  slide('point', 'Myth 3: Coaches watch it all'),
  slide('cta', '#4 Let it cut your film'),
  slide('point', '5. Name first'),
];

function brief(patch: Partial<WeekBrief>): WeekBrief {
  return {
    id: 'b1',
    companyId: 'c',
    format: 'slideshow',
    kind: 'handheld',
    postTypeId: null,
    postTypeKey: 'numbered_tips',
    postTypeName: null,
    title: 'Title',
    caption: '',
    searchTerm: '',
    hashtags: [],
    slides: tips,
    story: null,
    open: null,
    cta: { text: 'Plug', featureId: 'f1' },
    creatorNote: null,
    status: 'ready',
    ...patch,
  };
}

describe('renumber', () => {
  it('handles every numbering style', () => {
    expect(renumber('Tip #3 x', 1)).toBe('Tip #1 x');
    expect(renumber('Tip 3 x', 1)).toBe('Tip 1 x');
    expect(renumber('#3 x', 2)).toBe('#2 x');
    expect(renumber('Myth 3: x', 4)).toBe('Myth 4: x');
    expect(renumber('3. x', 5)).toBe('5. x');
    expect(renumber('3) x', 5)).toBe('5) x');
    expect(renumber('3 coaches said', 5)).toBe('3 coaches said');
  });
});

describe('creatorSlides', () => {
  it('shuffles the same way for the same assignment', () => {
    const a = creatorSlides(tips, true, 'assignment-1').map((s) => s.text.replace(/\d+/, ''));
    const b = creatorSlides(tips, true, 'assignment-1').map((s) => s.text.replace(/\d+/, ''));
    expect(a).toEqual(b);
  });

  it('numbers every body slide in order, the CTA included, and keeps the CTA slot', () => {
    const out = creatorSlides(tips, true, 'assignment-2');
    expect(out[4].role).toBe('cta');
    expect(out.slice(1).map((s) => s.text.match(/\d+/)?.[0])).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('buildSlides story', () => {
  const story = brief({
    kind: 'story',
    postTypeKey: null,
    story: { theme: '', beats: [], min: 3, max: 5 },
    slides: [
      slide('cover', 'My story', { box: { x: 0.5, y: 0.2, w: 0.8 }, tstyle: { bg: 'none', color: '#FF0000' } }),
      slide('cta', 'Try it', { inset_feature_id: 'f2', inset_box: { x: 0.5, y: 0.3, w: 0.5 } }),
    ],
  });

  it('keeps the manager cover and CTA design and makes story.min own slides', () => {
    const out = buildSlides(story);
    expect(out).toHaveLength(5);
    expect(out[0].box).toEqual({ x: 0.5, y: 0.2, w: 0.8 });
    expect(out[0].own).toBe(false);
    expect(out[4].insetFeatureId).toBe('f2');
    expect(out[4].insetBox).toEqual({ x: 0.5, y: 0.3, w: 0.5 });
    expect(out.filter((s) => s.own)).toHaveLength(3);
  });

  it('reads the own slide limits', () => {
    expect(ownSlideLimits(story)).toMatchObject({ min: 3, max: 5 });
    expect(ownSlideLimits(brief({ kind: 'open', open: { prompt: '', must: [], min: 4, max: 30 } }))).toMatchObject({ min: 4, max: 19 });
  });
});

describe('text style', () => {
  it('maps box and bare looks', () => {
    expect(textLook(undefined)).toEqual({ color: '#FFFFFF', bg: true });
    expect(textLook({ bg: 'box', bgColor: '#000', color: '#fff' })).toEqual({ color: '#000000', bg: true });
    expect(textLook({ bg: 'outline', color: '#ff0000' })).toEqual({ color: '#FF0000', bg: false });
    expect(textLook({ bg: 'none', color: 'red' })).toEqual({ color: '#FFFFFF', bg: false });
  });

  it('applies to the baked boxes', () => {
    const [s] = buildSlides(brief({ slides: [slide('cover', 'Hi', { tstyle: { bg: 'outline', color: '#123456' } })] }));
    expect(slideBoxes(s)[0]).toMatchObject({ color: '#123456', bg: false });
  });
});

describe('draft signature', () => {
  it('changes with the text', () => {
    const a = brief({});
    const b = brief({ slides: tips.map((s, k) => (k === 2 ? { ...s, text: '2) Under 3 minutes' } : s)) });
    expect(briefSignature(a)).toBe(briefSignature(brief({})));
    expect(briefSignature(a)).not.toBe(briefSignature(b));
  });
});

const pic = (n: number) => ({ uri: `file:///p${n}.jpg`, mimeType: null });

describe('mergeStaleDraft', () => {
  it('handheld carries photos by brief slide, not position', () => {
    const a = brief({});
    const old = buildSlides(a, 'x').map((s) => ({ ...s, photo: pic(s.briefIndex ?? -1) }));
    const edited = brief({ slides: tips.map((s, k) => (k === 2 ? { ...s, text: '2) Under 3 minutes' } : s)) });
    const out = mergeStaleDraft(buildSlides(edited, 'y'), old, { kind: 'handheld', sameBrief: true });
    expect(out.lost).toBe(0);
    for (const s of out.slides) expect(s.photo?.uri).toBe(`file:///p${s.briefIndex}.jpg`);
    expect(out.slides.find((s) => s.briefIndex === 2)?.text).toContain('Under 3');
  });

  it('a swapped brief keeps only cover and CTA photos and says so', () => {
    const old = buildSlides(brief({}), 'x').map((s, k) => ({ ...s, photo: pic(k) }));
    const out = mergeStaleDraft(buildSlides(brief({ id: 'b2' }), 'x'), old, { kind: 'handheld', sameBrief: false });
    expect(out.carried).toBe(2);
    expect(out.lost).toBe(4);
  });

  it('story keeps the own slides and refreshes the manager cover and CTA', () => {
    const story = brief({ kind: 'story', story: { theme: '', beats: [], min: 2, max: 5 }, slides: [slide('cover', 'Old'), slide('cta', 'Old plug')] });
    const old = buildSlides(story).map((s, k) => ({ ...s, text: s.own ? `mine ${k}` : s.text, photo: pic(k) }));
    old.splice(2, 0, { ...old[1], id: 'extra', text: 'mine extra', photo: pic(9) });
    const next = { ...story, slides: [slide('cover', 'New'), slide('cta', 'New plug')] };
    const out = mergeStaleDraft(buildSlides(next), old, { kind: 'story', sameBrief: true });
    expect(out.slides.map((s) => s.text)).toEqual(['New', 'mine 1', 'mine extra', 'mine 2', 'New plug']);
    expect(out.slides[0].photo?.uri).toBe('file:///p0.jpg');
    expect(out.slides[4].photo?.uri).toBe('file:///p3.jpg');
    expect(out.lost).toBe(0);
  });
});

describe('CTA placement', () => {
  const storyOf = (ctaAt?: 'after_hook' | 'end' | 'any') =>
    brief({
      kind: 'story',
      postTypeKey: null,
      story: { theme: '', beats: [], min: 2, max: 5, ...(ctaAt ? { ctaAt } : {}) },
      slides: [slide('cover', 'My story'), slide('cta', 'Try it', { inset_feature_id: 'f2' })],
    });

  it('reads the CTA slide place, then the saved Story setting, then any', () => {
    expect(ctaPlace(storyOf())).toBe('any');
    expect(ctaPlace(storyOf('end'))).toBe('end');
    const placed = { ...storyOf('end'), slides: [slide('cover', 'My story'), slide('cta', 'Try it', { place: 'after_hook' })] };
    expect(ctaPlace(placed)).toBe('after_hook');
    expect(ctaPlace(brief({ kind: 'handheld', slides: tips }))).toBe('any');
  });

  it('story starts the CTA last with end and with creator decides', () => {
    expect(buildSlides(storyOf()).map((s) => s.role)).toEqual(['cover', 'point', 'point', 'cta']);
    expect(buildSlides(storyOf('any')).map((s) => s.role)).toEqual(['cover', 'point', 'point', 'cta']);
    expect(buildSlides(storyOf('end')).map((s) => s.role)).toEqual(['cover', 'point', 'point', 'cta']);
  });

  it('story puts the CTA right after the cover with after_hook', () => {
    const out = buildSlides(storyOf('after_hook'));
    expect(out.map((s) => s.role)).toEqual(['cover', 'cta', 'point', 'point']);
    expect(out[1].insetFeatureId).toBe('f2');
    expect(out.slice(2).every((s) => s.own)).toBe(true);
  });

  it('the signature changes with after_hook only, so old drafts stay current', () => {
    expect(briefSignature(storyOf('end'))).toBe(briefSignature(storyOf()));
    expect(briefSignature(storyOf('after_hook'))).not.toBe(briefSignature(storyOf()));
  });

  it('a stale story draft follows the new placement and keeps own slides', () => {
    const old = buildSlides(storyOf('end')).map((s, k) => ({ ...s, text: s.own ? `mine ${k}` : s.text, photo: pic(k) }));
    const out = mergeStaleDraft(buildSlides(storyOf('after_hook')), old, { kind: 'story', sameBrief: true, place: 'after_hook' });
    expect(out.slides.map((s) => s.role)).toEqual(['cover', 'cta', 'point', 'point']);
    expect(out.slides.slice(2).map((s) => s.text)).toEqual(['mine 1', 'mine 2']);
    expect(out.lost).toBe(0);
  });

  it('a stale draft keeps the spot the creator gave a CTA they place', () => {
    const old = moveCtaSlide(buildSlides(storyOf('any')).map((s, k) => ({ ...s, text: s.own ? `mine ${k}` : s.text })), -1);
    expect(old.map((s) => s.role)).toEqual(['cover', 'point', 'cta', 'point']);
    const next = { ...storyOf('any'), slides: [slide('cover', 'New'), slide('cta', 'New plug')] };
    const out = mergeStaleDraft(buildSlides(next), old, { kind: 'story', sameBrief: true, place: 'any' });
    expect(out.slides.map((s) => s.text)).toEqual(['New', 'mine 1', 'New plug', 'mine 2']);
    const locked = mergeStaleDraft(buildSlides({ ...next, story: { ...next.story!, ctaAt: 'end' } }), old, { kind: 'story', sameBrief: true, place: 'end' });
    expect(locked.slides.map((s) => s.role)).toEqual(['cover', 'point', 'point', 'cta']);
  });

  it('handheld keeps the CTA at the manager index when the creator decides', () => {
    const first = [slide('cover', '4 tips'), slide('cta', '1. Let it cut your film'), slide('point', '2. Best clip first'), slide('point', '3. Under 4 minutes'), slide('point', '4. Name first')];
    for (const orderFree of [false, true]) {
      const out = creatorSlides(first, orderFree, 'seed-a');
      expect(out[1].role).toBe('cta');
      expect(out[1].briefIndex).toBe(1);
      expect(out.slice(1).map((s) => s.text.match(/^\d+/)?.[0])).toEqual(['1', '2', '3', '4']);
    }
  });

  it('handheld keeps the CTA last when the manager put it last', () => {
    const last = [slide('cover', '3 tips'), slide('point', '1. A'), slide('point', '2. B'), slide('cta', '3. Plug')];
    const out = creatorSlides(last, true, 'seed-b');
    expect(out[3].role).toBe('cta');
    expect(out[3].text).toBe('3. Plug');
  });

  it('handheld locks the CTA right after the hook or last, whatever the deck order', () => {
    const mid = [slide('cover', '4 tips'), slide('point', '1. A'), slide('cta', '2. Plug'), slide('point', '3. B'), slide('point', '4. C')];
    for (const orderFree of [false, true]) {
      const first = creatorSlides(mid, orderFree, 'seed-c', 'after_hook');
      expect(first[1]).toMatchObject({ role: 'cta', text: '1. Plug' });
      expect(first.slice(1).map((s) => s.text.match(/^\d+/)?.[0])).toEqual(['1', '2', '3', '4']);
      const last = creatorSlides(mid, orderFree, 'seed-c', 'end');
      expect(last[4]).toMatchObject({ role: 'cta', text: '4. Plug' });
      expect(creatorSlides(mid, orderFree, 'seed-c', 'any')[2].role).toBe('cta');
    }
    const b = brief({ kind: 'handheld', postTypeKey: 'numbered_tips', slides: mid.map((s) => (s.role === 'cta' ? { ...s, place: 'end' as const } : s)) });
    expect(buildSlides(b, 'seed-d').map((s) => s.role)).toEqual(['cover', 'point', 'point', 'point', 'cta']);
  });

  it('the creator moves a CTA they place among the body, never before the cover, renumbering', () => {
    const start = creatorSlides([slide('cover', '3 tips'), slide('point', '1. A'), slide('cta', '2. Plug'), slide('point', '3. B')]);
    expect(ctaMoves(start)).toEqual({ earlier: true, later: true });
    const up = moveCtaSlide(start, -1);
    expect(up.map((s) => s.text)).toEqual(['3 tips', '1. Plug', '2. A', '3. B']);
    expect(ctaMoves(up)).toEqual({ earlier: false, later: true });
    expect(moveCtaSlide(up, -1)).toBe(up);
    const end = moveCtaSlide(moveCtaSlide(up, 1), 1);
    expect(end.map((s) => s.text)).toEqual(['3 tips', '1. A', '2. B', '3. Plug']);
    expect(ctaMoves(end)).toEqual({ earlier: true, later: false });
    expect(moveCtaSlide(end, 1)).toBe(end);
  });

  it('lockCta puts a locked CTA back and leaves one the creator places', () => {
    const own = buildSlides(storyOf('any'));
    const moved = moveCtaSlide(own, -1);
    expect(lockCta(moved, 'any')).toBe(moved);
    expect(lockCta(moved, 'end').map((s) => s.role)).toEqual(['cover', 'point', 'point', 'cta']);
    expect(lockCta(moved, 'after_hook').map((s) => s.role)).toEqual(['cover', 'cta', 'point', 'point']);
    const atEnd = lockCta(moved, 'end');
    expect(lockCta(atEnd, 'end')).toBe(atEnd);
  });
});
