import { describe, expect, it, vi } from 'vitest';

import { featureTokens, matchFeatureMedia, type FeatureMediaRow, type LibraryFeature } from '../../../../lib/library-api';
import { durationLabel, featureVisual, fitIn, insetFrame, PHONE_ASPECT } from './geometry';

vi.mock('../../../../lib/supabase', () => ({ supabase: {} }));

const media = (id: string, kind: 'recording' | 'screenshot', title: string | null, created_at: string, description: string | null = null): FeatureMediaRow => ({
  id,
  kind,
  path: `c/library/${id}.${kind === 'recording' ? 'mp4' : 'jpg'}`,
  thumb_path: kind === 'recording' ? `c/library/${id}-poster.jpg` : null,
  title,
  description,
  duration_ms: kind === 'recording' ? 7400 : null,
  width: 1179,
  height: 2556,
  created_at,
});

const feature = (id: string, title: string, description = '', isGeneral = false) => ({ id, title, description, isGeneral });

describe('featureTokens', () => {
  it('splits slugs, singularizes and expands hl', () => {
    expect([...featureTokens('hl-videos')]).toEqual(['highlight', 'video']);
    expect([...featureTokens('Highlight video')]).toEqual(['highlight', 'video']);
  });
});

describe('matchFeatureMedia', () => {
  const rows = [
    media('rec-hl', 'recording', 'Highlight video', '2026-10-01'),
    media('rec-inbox', 'recording', 'Coach inbox', '2026-10-03'),
    media('shot-search', 'screenshot', 'School search results', '2026-10-02'),
    media('untitled', 'recording', null, '2026-10-05'),
  ];

  it('matches named files to features by their words', () => {
    const m = matchFeatureMedia([feature('hl', 'hl-videos'), feature('search', 'ai-school-search'), feature('inbox', 'inbox')], rows);
    expect(m.get('hl')?.recording?.id).toBe('rec-hl');
    expect(m.get('search')?.screenshot?.id).toBe('shot-search');
    expect(m.get('inbox')?.recording?.id).toBe('rec-inbox');
  });

  it('gives a feature with no fitting file nothing, and General the newest', () => {
    const m = matchFeatureMedia([feature('sent', 'campaigns-sent'), feature('general', 'General', '', true)], rows);
    expect(m.get('sent')).toEqual({ recording: null, screenshot: null });
    expect(m.get('general')?.recording?.id).toBe('untitled');
    expect(m.get('general')?.screenshot?.id).toBe('shot-search');
  });
});

describe('featureVisual', () => {
  const base = { clipUrl: null, screenshotUrl: null } as Pick<LibraryFeature, 'clipUrl' | 'screenshotUrl' | 'media'>;
  const clip = { url: 'https://x/c.mp4', posterUrl: 'https://x/p.jpg', durationMs: 7000, aspect: PHONE_ASPECT };
  const still = { url: 'https://x/s.jpg', aspect: 0.5 };

  it('leads with the clip on reels and the still on slideshows', () => {
    expect(featureVisual({ ...base, media: { clip, still } }, true).kind).toBe('clip');
    expect(featureVisual({ ...base, media: { clip, still } }, false).kind).toBe('still');
    expect(featureVisual({ ...base, media: { clip, still: null } }, false).kind).toBe('clip');
  });

  it('never draws a storage path', () => {
    expect(featureVisual({ clipUrl: null, screenshotUrl: 'c/library/1.jpg' }, false).kind).toBe('none');
    expect(featureVisual({ ...base, media: null }, true).kind).toBe('none');
  });
});

describe('geometry', () => {
  it('caps a tall recording at 1.5 times the box width', () => {
    const f = insetFrame(100, PHONE_ASPECT);
    expect(f.height).toBe(150);
    expect(f.width).toBeCloseTo(150 * PHONE_ASPECT);
  });
  it('keeps a landscape still at full width', () => {
    expect(insetFrame(100, 2)).toEqual({ width: 100, height: 50 });
  });
  it('fits inside a box', () => {
    expect(fitIn(56, 96, 0.5)).toEqual({ width: 48, height: 96 });
  });
  it('labels real durations only', () => {
    expect(durationLabel(7400)).toBe('0:07');
    expect(durationLabel(65000)).toBe('1:05');
    expect(durationLabel(null)).toBeNull();
  });
});
