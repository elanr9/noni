import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { emptyGuided, newClip } from './brief-library';
import { templateToDoc } from './brief-template-doc';

describe('templateToDoc green screen backgrounds', () => {
  it('puts a per-clip video behind its clip, never longer than the video', () => {
    const g = {
      ...emptyGuided(),
      fullGreen: false,
      clips: [newClip('one two three four five six seven eight nine ten eleven twelve thirteen', { green: true, gs: { src: 'https://x/v.mp4', kind: 'video' as const, dur: 4 } }), newClip('hi', { green: false, gs: { src: 'https://x/i.png', kind: 'image' as const, dur: 0 } })],
    };
    const doc = templateToDoc(g, 'Greenscreen');
    const a0 = doc.assets.find((a) => a.id === doc.blocks[0].cells[0].assetId);
    expect(a0?.kind).toBe('video');
    expect(a0?.localUri).toBe('https://x/v.mp4');
    expect(doc.blocks[0].cells[0].outMs - doc.blocks[0].cells[0].inMs).toBe(4000);
    // Green off on the second clip: no background even though one was picked.
    const a1 = doc.assets.find((a) => a.id === doc.blocks[1].cells[0].assetId);
    expect(a1?.localUri).toBeNull();
  });

  it('runs one shared video on across clips', () => {
    const g = { ...emptyGuided(), fullGreen: true, gs: { src: 'https://x/v.mp4', kind: 'video' as const, dur: 30 }, clips: [newClip('a'), newClip('b')] };
    const doc = templateToDoc(g, 'Greenscreen');
    expect(doc.blocks[0].cells[0].inMs).toBe(0);
    expect(doc.blocks[1].cells[0].inMs).toBe(doc.blocks[0].cells[0].outMs);
  });
});
