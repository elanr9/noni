import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  addTake,
  applyAutoEdit,
  autoFeatures,
  captionAt,
  captionLines,
  forgetAutoEdit,
  needsAutoEdit,
  outputWords,
  readAutoEdit,
  removeLastTake,
  skipAutoEdit,
  takesDurationMs,
  takesOf,
  type AutoEditReply,
  type AutoFeatureInput,
} from './auto-edit';
import { documentDurationMs, emptyVideoDocument, parseEditDocument, serializeEditDocument, type MediaAsset, type VideoDocument } from './edit-document';
import type { LibraryFeature } from './library-api';

function take(id: string, durationMs: number, storagePath: string | null = `c/a/asset-${id}.mp4`): MediaAsset {
  return { id, kind: 'video', localUri: `file:///${id}.mp4`, storagePath, durationMs, width: 1080, height: 1920 };
}

const feature: AutoFeatureInput = { id: 'f1', title: 'Film review', description: 'Coaches watch your film', kind: 'clip', path: 'co/features/review.mp4' };

function reply(partial: Partial<AutoEditReply>): AutoEditReply {
  return { takes: [], blocks: [], texts: [], media: [], cut_ms: 0, ai: true, ...partial };
}

describe('takes', () => {
  it('adds each take as a full block and counts its length', () => {
    let doc = emptyVideoDocument();
    doc = addTake(doc, take('t1', 5000));
    doc = addTake(doc, take('t2', 3000));
    expect(doc.blocks.map((b) => b.cells[0].assetId)).toEqual(['t1', 't2']);
    expect(doc.blocks[1].cells[0].outMs).toBe(3000);
    expect(takesOf(doc).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(takesDurationMs(doc)).toBe(8000);
    expect(needsAutoEdit(doc)).toBe(true);
  });

  it('removes the last take and its blocks', () => {
    let doc = addTake(addTake(emptyVideoDocument(), take('t1', 5000)), take('t2', 3000));
    doc = removeLastTake(doc);
    expect(takesOf(doc).map((t) => t.id)).toEqual(['t1']);
    expect(doc.blocks).toHaveLength(1);
  });

  it('an empty document needs nothing', () => {
    expect(needsAutoEdit(emptyVideoDocument())).toBe(false);
  });
});

describe('applyAutoEdit', () => {
  const base = addTake(addTake(emptyVideoDocument(), take('t1', 9000)), take('t2', 6000));
  const takes = takesOf(base);
  const edited = applyAutoEdit(
    base,
    takes,
    reply({
      takes: [
        { asset_id: 't1', duration_ms: 9000, words: [{ w: 'Five', s: 1000, e: 1300 }, { w: 'tips.', s: 1400, e: 1700 }] },
        { asset_id: 't2', duration_ms: 6000, words: [{ w: 'Noni', s: 600, e: 900 }] },
      ],
      blocks: [
        { asset_id: 't1', in_ms: 850, out_ms: 4000 },
        { asset_id: 't2', in_ms: 450, out_ms: 3000 },
        { asset_id: 'ghost', in_ms: 0, out_ms: 2000 },
      ],
      texts: [
        { role: 'hook', text: 'Five tips you need', start_ms: 0, end_ms: 1500 },
        { role: 'header', text: '1. Film high', start_ms: 1500, end_ms: 99999 },
      ],
      media: [{ feature_id: 'f1', start_ms: 3200, end_ms: 6000 }],
      cut_ms: 8150,
    }),
    [feature],
  );

  it('rebuilds the timeline from the kept ranges', () => {
    expect(edited.blocks.map((b) => [b.cells[0].assetId, b.cells[0].inMs, b.cells[0].outMs])).toEqual([
      ['t1', 850, 4000],
      ['t2', 450, 3000],
    ]);
    expect(documentDurationMs(edited)).toBe(5700);
  });

  it('puts the hook and headers up high and clamps them to the video', () => {
    const texts = edited.overlays.filter((o) => o.kind === 'text');
    expect(texts.map((t) => (t.kind === 'text' ? t.text : ''))).toEqual(['Five tips you need', '1. Film high']);
    expect(texts[1].endMs).toBe(5700);
    expect(texts.every((t) => t.kind === 'text' && t.y < 0.3 && t.bg)).toBe(true);
  });

  it('pops the feature recording up as a video asset from its storage path', () => {
    const media = edited.overlays.find((o) => o.kind === 'image');
    expect(media).toBeDefined();
    const asset = edited.assets.find((a) => a.id === (media?.kind === 'image' ? media.assetId : ''));
    expect(asset).toMatchObject({ kind: 'video', storagePath: 'co/features/review.mp4', localUri: null });
    expect(media?.endMs).toBe(5700);
  });

  it('records the takes so the edit does not run again', () => {
    expect(needsAutoEdit(edited)).toBe(false);
    expect(readAutoEdit(edited)?.cutMs).toBe(8150);
    expect(needsAutoEdit(forgetAutoEdit(edited))).toBe(true);
  });

  it('survives a save and load', () => {
    const loaded = parseEditDocument(serializeEditDocument(edited)) as VideoDocument;
    expect(readAutoEdit(loaded)?.takes.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(needsAutoEdit(loaded)).toBe(false);
  });

  it('runs again when a take is added after', () => {
    const more = addTake(edited, take('t3', 4000));
    expect(takesOf(more).map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(needsAutoEdit(more)).toBe(true);
  });

  it('keeps every take whole when nothing usable comes back', () => {
    const doc = applyAutoEdit(base, takes, reply({ blocks: [] }), []);
    expect(doc.blocks.map((b) => [b.cells[0].inMs, b.cells[0].outMs])).toEqual([
      [0, 9000],
      [0, 6000],
    ]);
  });

  it('captions follow the cut: words land on the output clock', () => {
    const words = outputWords(edited);
    expect(words.map((w) => [w.w, w.s])).toEqual([
      ['Five', 150],
      ['tips.', 550],
      ['Noni', 3150 + 150],
    ]);
    const lines = captionLines(words);
    expect(lines[0].text).toBe('Five tips.');
    expect(captionAt(lines, 3400)?.text).toBe('Noni');
    expect(captionAt(lines, 9000)).toBeNull();
  });
});

describe('skipAutoEdit', () => {
  it('keeps the timeline and stops asking', () => {
    const doc = addTake(emptyVideoDocument(), take('t1', 5000));
    const kept = skipAutoEdit(doc);
    expect(kept.blocks).toEqual(doc.blocks);
    expect(needsAutoEdit(kept)).toBe(false);
  });
});

describe('autoFeatures', () => {
  it('keeps features with stored media, clip first', () => {
    const f = (id: string, mediaPaths?: LibraryFeature['mediaPaths']): LibraryFeature => ({
      id,
      companyId: 'co',
      title: id,
      description: '',
      cta: '',
      clipUrl: null,
      screenshotUrl: null,
      isGeneral: false,
      ...(mediaPaths ? { mediaPaths } : {}),
    } as LibraryFeature);
    const out = autoFeatures([f('a', { clip: 'p/a.mp4', still: 'p/a.png' }), f('b', { clip: null, still: 'p/b.png' }), f('c'), f('d', { clip: null, still: null })]);
    expect(out.map((x) => [x.id, x.kind, x.path])).toEqual([
      ['a', 'clip', 'p/a.mp4'],
      ['b', 'still', 'p/b.png'],
    ]);
  });
});
