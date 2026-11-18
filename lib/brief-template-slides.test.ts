import { describe, expect, it } from 'vitest';

import { newClip, stText, type StOverlay } from './brief-library';
import { moveSlide, newTemplateSlide, slideshowToSlides, slidesToTemplate } from './brief-template-slides';

const pic: StOverlay = { id: 'o1', src: 'https://x/p.png', label: 'Product', x: 50, y: 50, w: 40 };

describe('slideshow template mapping', () => {
  it('makes one slide per clip with its texts and pictures', () => {
    const a = newClip('say this', { id: 'a', doc: { texts: [stText('Hook line', { id: 't1' })], overlays: [pic] } });
    const b = newClip('', { id: 'b', onScreen: 'Point one' });
    const slides = slideshowToSlides({ clips: [a, b] });
    expect(slides.map((s) => s.id)).toEqual(['a', 'b']);
    expect(slides[0].doc.texts[0].text).toBe('Hook line');
    expect(slides[0].doc.overlays).toEqual([pic]);
    expect(slides[1].doc.texts.map((t) => t.text)).toEqual(['Point one']);
  });

  it('round trips and keeps script, cta and order', () => {
    const a = newClip('script a', { id: 'a', cta: false, onScreen: 'A' });
    const b = newClip('script b', { id: 'b', cta: true, onScreen: 'B' });
    const g = { clips: [a, b] };
    const out = slidesToTemplate(moveSlide(slideshowToSlides(g), 1, 0), g);
    expect(out.map((c) => c.id)).toEqual(['b', 'a']);
    expect(out[0]).toMatchObject({ text: 'script b', cta: true, onScreen: 'B' });
    expect(out[1]).toMatchObject({ text: 'script a', cta: false, onScreen: 'A' });
  });

  it('joins texts into onScreen and drops empty texts', () => {
    const a = newClip('', { id: 'a' });
    const slides = [{ id: 'a', doc: { texts: [stText('One'), stText('  '), stText('Two')], overlays: [] } }];
    const [c] = slidesToTemplate(slides, { clips: [a] });
    expect(c.onScreen).toBe('One · Two');
    expect(c.doc?.texts).toHaveLength(2);
  });

  it('adds new clips for new slides and drops deleted ones', () => {
    const a = newClip('x', { id: 'a' });
    const b = newClip('y', { id: 'b' });
    const added = newTemplateSlide();
    const slides = [slideshowToSlides({ clips: [a] })[0], added];
    const out = slidesToTemplate(slides, { clips: [a, b] });
    expect(out.map((c) => c.id)).toEqual(['a', added.id]);
    expect(out[1]).toMatchObject({ text: '', cta: false, onScreen: '' });
  });

  it('clamps moves', () => {
    const s = [newTemplateSlide(), newTemplateSlide()];
    expect(moveSlide(s, 1, 5).map((x) => x.id)).toEqual([s[0].id, s[1].id]);
    expect(moveSlide(s, 0, 5).map((x) => x.id)).toEqual([s[1].id, s[0].id]);
  });
});
