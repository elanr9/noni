import { describe, expect, it, vi } from 'vitest';

import { libraryFeatureFromRow, pickFeature, sortLibraryFeatures, type LibraryFeature, type ProductFeatureRow } from './library-api';

vi.mock('./supabase', () => ({ supabase: {} }));

const row = (overrides: Partial<ProductFeatureRow>): ProductFeatureRow =>
  ({
    id: 'f',
    company_id: 'c1',
    name: 'hl-videos',
    what_it_does: 'AI highlight video made in 6 minutes',
    claim: 'I can see every coach who watched my film. Inkbound, link in bio.',
    surface: null,
    source: 'manual',
    source_ref: null,
    approved: true,
    rejected: false,
    created_at: '',
    clip_url: null,
    screenshot_url: 'https://x/hl.png',
    is_general: false,
    ...overrides,
  }) as ProductFeatureRow;

describe('libraryFeatureFromRow', () => {
  it('renames columns to the editor shape', () => {
    expect(libraryFeatureFromRow(row({ id: 'hl' }))).toEqual({
      id: 'hl',
      companyId: 'c1',
      title: 'hl-videos',
      description: 'AI highlight video made in 6 minutes',
      cta: 'I can see every coach who watched my film. Inkbound, link in bio.',
      clipUrl: null,
      screenshotUrl: 'https://x/hl.png',
      isGeneral: false,
    });
  });
});

describe('sortLibraryFeatures and pickFeature', () => {
  const features: LibraryFeature[] = [
    libraryFeatureFromRow(row({ id: 'sent', name: 'campaigns-sent' })),
    libraryFeatureFromRow(row({ id: 'general', name: 'General', is_general: true })),
    libraryFeatureFromRow(row({ id: 'hl', name: 'hl-videos' })),
  ];

  it('puts General first then sorts by title', () => {
    expect(sortLibraryFeatures(features).map((f) => f.id)).toEqual(['general', 'sent', 'hl']);
  });

  it('picks by id, then General, then the first', () => {
    expect(pickFeature(features, 'hl')?.id).toBe('hl');
    expect(pickFeature(features, 'missing')?.id).toBe('general');
    expect(pickFeature(features, null)?.id).toBe('general');
    expect(pickFeature(features.filter((f) => !f.isGeneral), null)?.id).toBe('sent');
    expect(pickFeature([], null)).toBeNull();
  });
});
