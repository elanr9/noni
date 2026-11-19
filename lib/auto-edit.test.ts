import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  addTake,
  appliedEdit,
  applyAutoEdit,
  applyEditPlan,
  CAPTION_ZONE_Y,
  editPlanDelta,
  TEXT_ZONE_Y,
  timelineTakes,
  takeSlots,
  undoEditPlan,
  type EditPlan,
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
import { blockDurationMs, documentDurationMs, emptyVideoDocument, parseEditDocument, serializeEditDocument, type MediaAsset, type Overlay, type VideoDocument } from './edit-document';
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

describe('applyEditPlan', () => {
  // The camera's document: one block per clip, the brief text over clip 1, the creator's own text over clip 2.
  const t1 = take('t1', 9000);
  const t2 = take('t2', 6000);
  const briefText: Overlay = { kind: 'text', id: 'brief-0', text: 'Old hook', color: '#FFFFFF', bg: false, size: 0.07, x: 0.5, y: 0.26, width: 0.9, startMs: 0, endMs: 9000 };
  const ownText: Overlay = { kind: 'text', id: 'mine', text: 'My note', color: '#FFFFFF', bg: false, size: 0.05, x: 0.5, y: 0.5, startMs: 10000, endMs: 13000 };
  const base: VideoDocument = {
    ...emptyVideoDocument(),
    assets: [t1, t2],
    blocks: [
      { id: 'b-0-t1', layout: 'single', cells: [{ id: 'c1', assetId: 't1', inMs: 0, outMs: 9000, speed: 1, muted: false, crop: null }] },
      { id: 'b-1-t2', layout: 'single', cells: [{ id: 'c2', assetId: 't2', inMs: 0, outMs: 6000, speed: 1, muted: false, crop: null }] },
    ],
    overlays: [briefText, ownText],
    subtitles: { enabled: false, y: 0.78 },
  };
  const plan: EditPlan = {
    keeps: [
      { asset_id: 't2', in_ms: 500, out_ms: 4500, zoom: 1, speed: 1, reason: 'opens stronger' },
      { asset_id: 't1', in_ms: 1000, out_ms: 4000, zoom: 1.2, speed: 1.5, reason: 'the claim' },
      { asset_id: 't1', in_ms: 5000, out_ms: 5100, zoom: 1, speed: 1, reason: 'too short' },
      { asset_id: 'ghost', in_ms: 0, out_ms: 2000, zoom: 1, speed: 1, reason: '' },
    ],
    texts: [
      { role: 'hook', text: 'New hook', start_ms: 0, end_ms: 2600, position: 'upper' },
      { role: 'label', text: 'One hour back', start_ms: 4200, end_ms: 99999, position: 'center' },
    ],
    inserts: [
      { media_id: 'f2', start_ms: 1000, end_ms: 3000, layout: 'split' },
      { media_id: 'f1', start_ms: 4200, end_ms: 5800, layout: 'overlay' },
    ],
    captions: { enabled: true, position: 'lower' },
    sound: { use_brief_track: true, track_volume: 12, voice_volume: 100 },
    cut_ms: 8000,
    summary: ['Cut 8 seconds of pauses'],
    ai: true,
  };
  const still: AutoFeatureInput = { id: 'f2', title: 'Scan', description: '', kind: 'still', path: 'co/features/scan.png' };
  const track = { id: 'trk', title: 'Soft keys', artist: 'Noni', dur: 30, url: 'https://x/y.mp3' };
  const takes = timelineTakes(base);
  const edited = applyEditPlan(base, plan, takes, {
    media: [feature, still],
    replaceOverlayIds: ['brief-0'],
    soundTrack: track,
    words: [{ asset_id: 't2', duration_ms: 6000, words: [{ w: 'Hi', s: 600, e: 900 }] }],
    runId: 'run-1',
  });

  it('reads takes and their script slots from the camera document', () => {
    expect(takes.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(takeSlots(base)).toEqual({ t1: 0, t2: 1 });
  });

  it('rebuilds the timeline in plan order with crop and speed, dropping what cannot play', () => {
    const cells = edited.blocks.map((b) => b.cells[0]);
    expect(cells.map((c) => c.assetId)).toEqual(['t2', 't2', 't2', 't1']);
    expect(cells[3]).toMatchObject({ inMs: 1000, outMs: 4000, speed: 1.5, crop: { scale: 1.2, x: 0, y: 0 } });
    expect(documentDurationMs(edited)).toBe(4000 + 2000);
    expect(edited.blocks.every((b) => blockDurationMs(b) >= 300)).toBe(true);
  });

  it('puts a split insert into the blocks at its window and floats the other one', () => {
    expect(edited.blocks.map((b) => b.layout)).toEqual(['single', 'split_v', 'single', 'single']);
    const split = edited.blocks[1];
    expect([split.cells[0].inMs, split.cells[0].outMs]).toEqual([1500, 3500]);
    expect(split.cells[1]).toMatchObject({ assetId: 'feat-f2', inMs: 0, outMs: 2000, muted: true });
    const floating = edited.overlays.filter((o) => o.kind === 'image');
    expect(floating).toHaveLength(1);
    expect(floating[0]).toMatchObject({ assetId: 'feat-f1', startMs: 4200, endMs: 5800 });
    expect(floating[0].y).toBeGreaterThan(0.5);
    expect(edited.assets.map((a) => a.id).sort()).toEqual(['feat-f1', 'feat-f2', 't1', 't2']);
  });

  it('places plan text in its zone, clamps it, and replaces only the overlay the plan names', () => {
    const texts = edited.overlays.flatMap((o) => (o.kind === 'text' ? [o] : []));
    expect(texts.map((t) => t.text)).toEqual(['My note', 'New hook', 'One hour back']);
    expect(texts[1]).toMatchObject({ y: TEXT_ZONE_Y.upper, startMs: 0, endMs: 2600, bg: true });
    expect(texts[2].endMs).toBe(6000);
    // The creator's own text sat 1 s into t2; t2 now opens the video from 0.5 s.
    expect(texts[0]).toMatchObject({ id: 'mine', startMs: 500, endMs: 3500, y: 0.5 });
  });

  it('turns captions on in the plan zone and mixes the brief sound under the voice', () => {
    expect(edited.subtitles).toEqual({ enabled: true, y: CAPTION_ZONE_Y.lower });
    expect(edited.audio).toEqual({ track, start: 0, vol: 12, voice: 100 });
    expect(outputWords(edited).map((w) => [w.w, w.s])).toEqual([['Hi', 100]]);
  });

  it('leaves a sound the creator picked alone', () => {
    const own = { track: { ...track, id: 'other' }, start: 3, vol: 80, voice: 100 };
    expect(applyEditPlan({ ...base, audio: own }, plan, takes, { soundTrack: track }).audio).toEqual(own);
  });

  it('undoes in one step, back to the camera timeline', () => {
    const undone = undoEditPlan(edited);
    expect(undone.blocks).toEqual(base.blocks);
    expect(undone.overlays).toEqual(base.overlays);
    expect(undone.subtitles).toEqual(base.subtitles);
    expect(undone.audio).toBeUndefined();
    expect(undone.assets.map((a) => a.id)).toEqual(['t1', 't2']);
    expect(appliedEdit(undone)).toBeNull();
    expect(readAutoEdit(undone)?.words.t2).toEqual([['Hi', 600, 900]]);
    expect(undoEditPlan(base)).toBe(base);
  });

  it('keeps the plan and both timelines through a save, and reports what changed after', () => {
    const loaded = parseEditDocument(serializeEditDocument(edited)) as VideoDocument;
    const applied = appliedEdit(loaded);
    expect(applied?.plan.summary).toEqual(['Cut 8 seconds of pauses']);
    expect(applied?.runId).toBe('run-1');
    expect(applied?.before.blocks.map((b) => b.id)).toEqual(['b-0-t1', 'b-1-t2']);
    expect(editPlanDelta(loaded)).toEqual({ ai: true, blocksChanged: false, textsRemoved: 0, textsEdited: 0, textsAdded: 0, captionsChanged: false, soundChanged: false });
    const hook = loaded.overlays.find((o) => o.kind === 'text' && o.text === 'New hook')!;
    const changed: VideoDocument = {
      ...loaded,
      blocks: loaded.blocks.slice(1),
      overlays: loaded.overlays.filter((o) => o.id !== hook.id),
      subtitles: { ...loaded.subtitles, enabled: false },
    };
    expect(editPlanDelta(changed)).toMatchObject({ blocksChanged: true, textsRemoved: 1, captionsChanged: true });
    expect(editPlanDelta(base)).toBeNull();
  });

  it('a second plan replaces the first plan\'s untouched overlays and still knows every take', () => {
    const again = applyEditPlan(edited, { ...plan, keeps: [plan.keeps[0]], inserts: [], texts: [plan.texts[0]] }, timelineTakes(edited), { media: [feature, still] });
    expect(again.overlays.flatMap((o) => (o.kind === 'text' ? [o.text] : []))).toEqual(['My note', 'New hook']);
    expect(again.overlays.some((o) => o.kind === 'image')).toBe(false);
    expect(timelineTakes(again).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(undoEditPlan(again).blocks).toEqual(edited.blocks);
  });

  it('leaves the document alone when the plan keeps nothing usable', () => {
    expect(applyEditPlan(base, { ...plan, keeps: [] }, takes)).toBe(base);
  });
});
