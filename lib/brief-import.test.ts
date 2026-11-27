import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: class {} }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { guidedPlanOf } from './brief-ai';
import { emptyGuided, outlineTwinId } from './brief-library';
import { fileSizeLabel, guidedOf, importSaveInput, linkSource, parseSseBlock, pool } from './brief-import';

const answer = (type: 'Talking Head' | 'Slideshow' | 'Long Text') => ({
  title: 'I killed six ferns',
  phrase: 'how to keep ferns alive',
  angle: 'For new plant owners.',
  clips: type === 'Long Text'
    ? [{ say: '', onScreen: 'Para one.\n\nPara two.', cta: false, shot: 'Hold the frame.' }]
    : [
        { say: type === 'Slideshow' ? '' : 'I killed six ferns.', onScreen: 'I killed six ferns', cta: false, shot: 'Window.' },
        { say: type === 'Slideshow' ? '' : 'Search Fernly.', onScreen: 'Search Fernly', cta: true, shot: '' },
      ],
  caption: 'How to keep ferns alive.',
  tags: ['#ferns'],
  hooks: [],
  warnings: [],
});

describe('sources', () => {
  it('names links by where they point and refuses what is not a link', () => {
    expect(linkSource('docs.google.com/document/d/abc/edit')).toMatchObject({ kind: 'link', name: 'Google Doc', url: 'https://docs.google.com/document/d/abc/edit' });
    expect(linkSource('https://docs.google.com/spreadsheets/d/abc')?.name).toBe('Google Sheet');
    expect(linkSource('https://acme.notion.site/Brief-123')?.name).toBe('Notion page');
    expect(linkSource('https://www.dropbox.com/s/x/brief.pdf')?.name).toBe('dropbox.com');
    expect(linkSource('not a link')).toBeNull();
    expect(linkSource('localhost')).toBeNull();
    expect(linkSource('')).toBeNull();
  });

  it('labels sizes and reads stream events', () => {
    expect([fileSizeLabel(null), fileSizeLabel(900), fileSizeLabel(1_840_000)]).toEqual(['', '1 KB', '1.8 MB']);
    expect(parseSseBlock('event: post\ndata: {"index":0,"title":"One"}')).toEqual({ event: 'post', data: { index: 0, title: 'One' } });
    expect(parseSseBlock(': keepalive')).toBeNull();
    expect(parseSseBlock('event: post\ndata: {"half')).toBeNull();
  });
});

describe('importSaveInput', () => {
  it('saves a spoken post as a guided brief with its outline twin', () => {
    const plan = guidedPlanOf(answer('Talking Head'), emptyGuided(), 'Talking Head');
    const input = importSaveInput({ index: 0, type: 'Talking Head', plan }, 'b1');
    expect(input).toMatchObject({ id: 'b1', kind: 'Guided', type: 'Talking Head', title: 'I killed six ferns', caption: 'How to keep ferns alive.', tags: ['#ferns'] });
    expect(input.noTwin).toBeUndefined();
    expect(outlineTwinId(input.id)).toBe('b1-o');
    expect(input.notes).toBe('Search: how to keep ferns alive\nHook: I killed six ferns.\nClip 1: Search Fernly.');
    expect(input.clips?.map((c) => [c.text, c.onScreen, c.cta, c.green])).toEqual([['I killed six ferns.', 'I killed six ferns', false, false], ['Search Fernly.', 'Search Fernly', true, false]]);
    expect(input.g).toMatchObject({ filled: true, phrase: 'how to keep ferns alive', angle: 'For new plant owners.' });
  });

  it('saves what the manager changed in review', () => {
    const post = { index: 0, type: 'Talking Head' as const, plan: guidedPlanOf(answer('Talking Head'), emptyGuided(), 'Talking Head') };
    const g = guidedOf(post);
    const input = importSaveInput(post, 'b9', { ...g, title: 'Six ferns, one fix', caption: 'New caption.' });
    expect(input).toMatchObject({ id: 'b9', title: 'Six ferns, one fix', caption: 'New caption.' });
    expect(input.g?.clips.length).toBe(2);
  });

  it('saves a long text post the way Create does, with no twin', () => {
    const plan = guidedPlanOf(answer('Long Text'), emptyGuided(), 'Long Text');
    const input = importSaveInput({ index: 0, type: 'Long Text', plan }, 'b2');
    expect(input).toMatchObject({ id: 'b2', type: 'Long Text', kind: 'Guided', noTwin: true });
    expect(input.lt?.onScreen).toBe('Para one.\n\nPara two.');
    expect(input.clips?.[0].onScreen).toBe('Para one.\n\nPara two.');
  });

  it('keeps slides silent and puts the close on its own slide', () => {
    const plan = guidedPlanOf(answer('Slideshow'), emptyGuided(), 'Slideshow');
    const input = importSaveInput({ index: 0, type: 'Slideshow', plan }, 'b3');
    expect(input.clips?.every((c) => c.text === '')).toBe(true);
    expect(input.clips?.[1].doc?.texts[0].text).toBe('Search Fernly');
  });
});

describe('pool', () => {
  it('runs everything, a few at a time, and survives a failure', async () => {
    let live = 0;
    let peak = 0;
    const seen: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live -= 1;
      if (n === 4) throw new Error('boom');
      seen.push(n);
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 5, 6, 7]);
  });
});
