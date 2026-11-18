import { describe, expect, it } from 'vitest';

import { addTags, normalizeTag, removeTag } from './brief-tags';

describe('brief tags', () => {
  it('normalizes one tag', () => {
    expect(normalizeTag('soccer')).toBe('#soccer');
    expect(normalizeTag('  ##College Soccer! ')).toBe('#CollegeSoccer');
    expect(normalizeTag('#')).toBe('');
    expect(normalizeTag('  ')).toBe('');
  });

  it('adds several at once and skips duplicates in any case', () => {
    expect(addTags(['#fieldvision'], '#FieldVision, recruiting #matchfilm')).toEqual(['#fieldvision', '#recruiting', '#matchfilm']);
    expect(addTags([], '#a#b')).toEqual(['#a', '#b']);
  });

  it('removes a tag', () => {
    expect(removeTag(['#a', '#b'], '#a')).toEqual(['#b']);
  });
});
