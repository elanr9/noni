import { describe, expect, it, vi } from 'vitest';

import type { BriefSlide, WeekBrief } from '../../../../lib/briefs-api';
import { emptyVideoDocument, type MediaAsset, type VideoDocument } from '../../../../lib/edit-document';
import {
  briefRev,
  clipPlan,
  flaggedItemIds,
  lockPlan,
  parseStoredPlan,
  plugFirst,
  plugItem,
  rebuildPlan,
  storedPlanJson,
  EMPTY_META,
  uniqueIds,
  withFreeClip,
  withPlug,
  type ReelPlanItem,
} from './plan';
import {
  addTake,
  applyDeadAirCuts,
  deleteItemBlocks,
  overlayIdFor,
  insetIdFor,
  lockPlug,
  recoverPlan,
  syncPlanOverlays,
  trackPlanOverlayDeletes,
} from './sync';

vi.mock('../../../../theme/tokens', () => ({ color: { white: '#FFFFFF' }, briefTone: {} }));
vi.mock('../../../../modules/video-editor', () => ({ isVideoEditorAvailable: () => false, speechBounds: vi.fn() }));

const slide = (role: BriefSlide['role'], text: string, shot: string, feature: string | null = null): BriefSlide => ({
  role,
  text,
  shot,
  inset_feature_id: feature,
});

function brief(over: Partial<WeekBrief> = {}): WeekBrief {
  return {
    id: 'b1',
    companyId: 'c1',
    format: 'reel',
    kind: 'handheld',
    postTypeId: null,
    postTypeKey: 'how_to',
    postTypeName: null,
    title: 'Title',
    caption: '',
    searchTerm: '',
    hashtags: [],
    slides: [slide('cover', 'Hook text', 'Say the hook'), slide('point', '1. One', 'Say one'), slide('point', '2. Two', 'Say two'), slide('cta', 'Plug', '', 'f1')],
    story: null,
    open: null,
    cta: { text: 'Plug line', featureId: 'f1' },
    creatorNote: null,
    status: 'ready',
    ...over,
  };
}

let n = 0;
function video(ms = 2000): MediaAsset {
  n += 1;
  return { id: `a${n}`, kind: 'video', localUri: `file:///t${n}.mp4`, storagePath: null, durationMs: ms, width: null, height: null };
}

/** Record one take for each item id in order; returns doc and items with block ids. */
function record(doc: VideoDocument, items: ReelPlanItem[], ids: string[], replace = false) {
  let d = doc;
  let plan = items;
  for (const id of ids) {
    const r = addTake(d, video(), plan, id, replace);
    d = r.doc;
    const blockId = r.blockId as string;
    plan = plan.map((p) => (p.id === id ? { ...p, blockIds: replace ? [blockId] : [...p.blockIds, blockId] } : p));
  }
  return { doc: d, items: plan };
}

const order = (doc: VideoDocument, items: ReelPlanItem[]) =>
  doc.blocks.map((b) => items.findIndex((p) => p.blockIds.includes(b.id)));

describe('clipPlan', () => {
  it('keeps the brief slide index on handheld items', () => {
    const plan = clipPlan(brief());
    expect(plan.map((p) => p.slideIndex)).toEqual([0, 1, 2, 3]);
    expect(plan[3].say).toBe('Say it while the recording plays');
  });
});

describe('addTake', () => {
  it('puts a retake of an earlier item next to its clip, not at the end', () => {
    const plan = clipPlan(brief());
    const first = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const again = record(first.doc, first.items, [plan[0].id]);
    expect(order(again.doc, again.items)).toEqual([0, 0, 1, 2, 3]);
  });

  it('records a skipped item before the next recorded one', () => {
    const plan = clipPlan(brief());
    const r = record(emptyVideoDocument(), plan, [plan[0].id, plan[2].id, plan[1].id]);
    expect(order(r.doc, r.items)).toEqual([0, 1, 2]);
  });

  it('replace swaps the old take in place', () => {
    const plan = clipPlan(brief());
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const oldHook = r.items[0].blockIds[0];
    const redo = record(r.doc, r.items, [plan[0].id], true);
    expect(redo.doc.blocks).toHaveLength(4);
    expect(redo.doc.blocks.some((b) => b.id === oldHook)).toBe(false);
    expect(order(redo.doc, redo.items)).toEqual([0, 1, 2, 3]);
  });
});

describe('syncPlanOverlays', () => {
  it('follows the clips and never strips text of items with no clips', () => {
    const plan = clipPlan(brief());
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const synced = syncPlanOverlays(r.doc, r.items);
    expect(synced.overlays.filter((o) => o.id.startsWith('pt-'))).toHaveLength(4);
    // A plan that lost its block ids leaves the text alone.
    const lost = r.items.map((p) => ({ ...p, blockIds: [] }));
    expect(syncPlanOverlays(synced, lost)).toBe(synced);
  });

  it('adds the plug screenshot when its asset is ready, and maps bg none', () => {
    const plan = clipPlan(brief()).map((p) => (p.role === 'cover' ? { ...p, tstyle: { bg: 'none' as const } } : p));
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const shot: MediaAsset = { id: 'featf1', kind: 'image', localUri: null, storagePath: 'c1/shot.png', durationMs: null, width: null, height: null };
    const synced = syncPlanOverlays(r.doc, r.items, { f1: shot });
    const plug = r.items[3];
    const inset = synced.overlays.find((o) => o.id === insetIdFor(plug));
    expect(inset?.kind).toBe('image');
    expect(synced.assets.some((a) => a.id === 'featf1')).toBe(true);
    const cover = synced.overlays.find((o) => o.id === overlayIdFor(r.items[0]));
    expect(cover?.kind === 'text' && cover.bg).toBe(false);
  });
});

describe('deleteItemBlocks', () => {
  it('removes the text of an item left with no clip', () => {
    const plan = clipPlan(brief());
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const synced = syncPlanOverlays(r.doc, r.items);
    const out = deleteItemBlocks(synced, r.items, [r.items[1].blockIds[0]]);
    expect(out.overlays.some((o) => o.id === overlayIdFor(r.items[1]))).toBe(false);
    expect(out.overlays.some((o) => o.id === overlayIdFor(r.items[2]))).toBe(true);
  });
});

describe('rebuildPlan', () => {
  it('carries takes by brief slide and refreshes text', () => {
    const old = clipPlan(brief()).map((p, i) => ({ ...p, blockIds: [`b${i}`] }));
    const changed = brief({
      slides: [slide('cover', 'Hook text', 'Say the hook'), slide('point', '1. One', 'Say one better'), slide('point', '2. Two', 'Say two'), slide('point', '3. New', 'Say three'), slide('cta', 'Plug', '', 'f1')],
    });
    expect(briefRev(changed)).not.toBe(briefRev(brief()));
    const next = rebuildPlan(changed, old);
    expect(next.map((p) => p.blockIds)).toEqual([['b0'], ['b1'], ['b2'], [], ['b3']]);
    expect(next[1].say).toBe('Say one better');
    expect(next[1].id).toBe(old[1].id);
  });

  it('keeps Story free clips and the plug the creator added', () => {
    const story = brief({ kind: 'story', slides: [slide('cover', '', 'Open with it')], story: { theme: 'T', beats: [], min: 3, max: 5 } });
    const old = [...clipPlan(story).map((p) => ({ ...p, blockIds: ['h'] })), { id: 'free1', role: 'point' as const, text: '', say: '', free: true, insetFeatureId: null, blockIds: ['f'] }, { ...plugItem('Old plug', 'f1', 'say'), blockIds: ['p'] }];
    const next = rebuildPlan(story, old);
    expect(next.map((p) => p.blockIds[0])).toEqual(['h', 'f', 'p']);
    expect(next[2].text).toBe('Plug line');
  });
});

describe('recoverPlan', () => {
  it('rebuilds the mapping from text windows when the plan is gone', () => {
    const b = brief();
    const plan = clipPlan(b);
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const synced = syncPlanOverlays(r.doc, r.items);
    const back = recoverPlan(b, synced, clipPlan(b));
    expect(back.map((p) => p.blockIds)).toEqual(r.items.map((p) => p.blockIds));
    expect(back.map((p) => p.id)).toEqual(r.items.map((p) => p.id));
  });
});

describe('flaggedItemIds', () => {
  it('maps manager labels onto plan items', () => {
    const plan = clipPlan(brief());
    expect(flaggedItemIds(plan, ['CTA', 'Hook', 'Point 2'])).toEqual([plan[0].id, plan[2].id, plan[3].id]);
    expect(flaggedItemIds(plan, ['Clip 2'])).toEqual([plan[1].id]);
  });
});

describe('stored plan', () => {
  it('round trips through the document json', () => {
    const plan = clipPlan(brief());
    const json = storedPlanJson({ rev: 'r', items: plan, meta: EMPTY_META });
    expect(parseStoredPlan(json)?.items).toEqual(plan);
    expect(parseStoredPlan({ rev: 'r', items: [{ id: 1 }] })).toBeNull();
  });
});

describe('applyDeadAirCuts', () => {
  it('skips blocks that changed while the analysis ran', () => {
    const plan = clipPlan(brief());
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const [b0, b1] = r.doc.blocks;
    const gone = deleteItemBlocks(r.doc, r.items, [b1.id]);
    const out = applyDeadAirCuts(gone, [
      { blockId: b0.id, assetId: b0.cells[0].assetId, inMs: 300, outMs: 1500 },
      { blockId: b1.id, assetId: b1.cells[0].assetId, inMs: 300, outMs: 1500 },
    ]);
    expect(out.blocks[0].cells[0]).toMatchObject({ inMs: 300, outMs: 1500 });
    expect(out.blocks).toHaveLength(3);
  });
});

describe('syncPlanOverlays settles', () => {
  it('returns the same document once windows are synced, even for fractional clip lengths', () => {
    const plan = clipPlan(brief());
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const odd = { ...r.doc, blocks: r.doc.blocks.map((b) => ({ ...b, cells: b.cells.map((c) => ({ ...c, speed: 1.5 as const })) })) };
    const once = syncPlanOverlays(odd, r.items);
    expect(syncPlanOverlays(once, r.items)).toBe(once);
  });
});

describe('deleted plan overlays', () => {
  it('stay deleted through the sync and come back with undo', () => {
    const plan = clipPlan(brief());
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const synced = syncPlanOverlays(r.doc, r.items);
    const hookId = overlayIdFor(r.items[0]);
    const deleted = { ...synced, overlays: synced.overlays.filter((o) => o.id !== hookId) };
    const tracked = trackPlanOverlayDeletes(synced, deleted, r.items);
    expect(tracked[0].hideText).toBe(true);
    expect(syncPlanOverlays(deleted, tracked)).toBe(deleted);
    // Undo: the overlay is back, the flag goes.
    const undone = trackPlanOverlayDeletes(deleted, synced, tracked);
    expect(undone[0].hideText).toBeUndefined();
    expect(trackPlanOverlayDeletes(synced, synced, r.items)).toBe(r.items);
  });
});

describe('unique plan ids', () => {
  it('gives a repeated id a fresh one and sync handles each id once', () => {
    const plan = clipPlan(brief());
    const twin = [...plan, { ...plan[1] }];
    const fixed = uniqueIds(twin);
    expect(new Set(fixed.map((p) => p.id)).size).toBe(fixed.length);
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    const dup = [...r.items, { ...r.items[1], blockIds: [r.items[2].blockIds[0]] }];
    const once = syncPlanOverlays(r.doc, dup);
    expect(syncPlanOverlays(once, dup)).toBe(once);
  });

  it('recoverPlan never repeats an id when one text window owns split clips', () => {
    const b = brief({ kind: 'story', slides: [], story: { theme: 'T', beats: [], min: 3, max: 5 } });
    let d = emptyVideoDocument();
    for (let i = 0; i < 3; i++) d = addTake(d, video(1000), [], 'x').doc;
    d = {
      ...d,
      overlays: [
        // B first: on the tie for the middle clip it wins, so A owns clips 1 and 3.
        { kind: 'text', id: 'pt-B', text: 'B', color: '#FFFFFF', bg: true, size: 0.05, x: 0.5, y: 0.5, startMs: 1000, endMs: 2000 },
        { kind: 'text', id: 'pt-A', text: 'A', color: '#FFFFFF', bg: true, size: 0.05, x: 0.5, y: 0.5, startMs: 0, endMs: 3000 },
      ],
    };
    const back = recoverPlan(b, d, clipPlan(b));
    expect(back.filter((p) => p.id === 'A')).toHaveLength(1);
    expect(new Set(back.map((p) => p.id)).size).toBe(back.length);
  });
});

describe('CTA placement', () => {
  const storyOf = (ctaAt?: 'after_hook' | 'end' | 'any') =>
    brief({
      kind: 'story',
      postTypeKey: null,
      slides: [slide('cover', '', 'Open with it'), slide('cta', 'Plug slide', 'I use it for this', 'f2')],
      story: { theme: 'T', beats: [], min: 2, max: 5, ...(ctaAt ? { ctaAt } : {}) },
    });
  const freeItem = (id: string, blockIds: string[] = []): ReelPlanItem => ({ id, role: 'point', text: '', say: '', free: true, insetFeatureId: null, blockIds });

  it('story plans only the hook by default, with end and with creator decides', () => {
    expect(clipPlan(storyOf()).map((p) => p.role)).toEqual(['cover']);
    expect(clipPlan(storyOf('any')).map((p) => p.role)).toEqual(['cover']);
    expect(clipPlan(storyOf('end')).map((p) => p.role)).toEqual(['cover']);
    expect(plugFirst(storyOf('end'))).toBe(false);
  });

  it('story plans hook then plug with after_hook', () => {
    const plan = clipPlan(storyOf('after_hook'));
    expect(plan.map((p) => p.role)).toEqual(['cover', 'cta']);
    expect(plan[1]).toMatchObject({ text: 'Plug line', say: 'I use it for this', insetFeatureId: 'f1', free: false });
    expect(plugFirst(storyOf('after_hook'))).toBe(true);
  });

  it('free clips go before a closing plug and after an opening one', () => {
    const plan = [...clipPlan(storyOf()), plugItem('Plug', 'f1', 'say')];
    expect(withFreeClip(plan, freeItem('x')).map((p) => p.role)).toEqual(['cover', 'point', 'cta']);
    const first = clipPlan(storyOf('after_hook'));
    const one = withFreeClip(first, freeItem('x'), true);
    const two = withFreeClip(one, freeItem('y'), true);
    expect(two.map((p) => p.id)).toEqual([first[0].id, first[1].id, 'x', 'y']);
  });

  it('withPlug puts the plug right after the hook or last', () => {
    const base = [...clipPlan(storyOf()), freeItem('x'), freeItem('y')];
    const plug = plugItem('Plug', 'f1', 'say');
    expect(withPlug(base, plug, true).map((p) => p.role)).toEqual(['cover', 'cta', 'point', 'point']);
    expect(withPlug(base, plug, false).map((p) => p.role)).toEqual(['cover', 'point', 'point', 'cta']);
  });

  it('records hook, plug, then the creator clips on the timeline', () => {
    const b = storyOf('after_hook');
    const plan = clipPlan(b);
    let r = record(emptyVideoDocument(), plan, [plan[0].id, plan[1].id]);
    const free = freeItem('free-a');
    const placed = withFreeClip(r.items, free, true);
    r = record(r.doc, placed, ['free-a']);
    expect(order(r.doc, r.items)).toEqual([0, 1, 2]);
    expect(r.items.map((p) => p.id)).toEqual([plan[0].id, plan[1].id, 'free-a']);
  });

  it('the rev changes with after_hook only', () => {
    expect(briefRev(storyOf('end'))).toBe(briefRev(storyOf()));
    expect(briefRev(storyOf('after_hook'))).not.toBe(briefRev(storyOf()));
  });

  it('rebuild moves an unrecorded plug right after the hook and keeps free clips after it', () => {
    const old = [{ ...clipPlan(storyOf())[0], blockIds: ['h'] }, freeItem('f1', ['f']), { ...plugItem('Old plug', 'f1', 'say'), id: 'plug' }];
    const next = rebuildPlan(storyOf('after_hook'), old);
    expect(next.map((p) => p.role)).toEqual(['cover', 'cta', 'point']);
    expect(next[1].id).toBe('plug');
    expect(next[2].blockIds).toEqual(['f']);
  });

  it('rebuild keeps a recorded plug the creator places where they have it', () => {
    const old = [{ ...clipPlan(storyOf())[0], blockIds: ['h'] }, { ...plugItem('Old plug', 'f1', 'say'), id: 'plug', blockIds: ['p'] }, freeItem('f1', ['f'])];
    const next = rebuildPlan({ ...storyOf('any'), title: 'New title' }, old);
    expect(next.map((p) => p.blockIds[0])).toEqual(['h', 'p', 'f']);
  });

  it('rebuild puts a recorded plug back in a locked spot', () => {
    const old = [{ ...clipPlan(storyOf())[0], blockIds: ['h'] }, freeItem('f1', ['f']), { ...plugItem('Old plug', 'f1', 'say'), id: 'plug', blockIds: ['p'] }];
    expect(rebuildPlan(storyOf('after_hook'), old).map((p) => p.blockIds[0])).toEqual(['h', 'p', 'f']);
    const opened = [old[0], old[2], old[1]];
    expect(rebuildPlan(storyOf('end'), opened).map((p) => p.blockIds[0])).toEqual(['h', 'f', 'p']);
  });

  it('rebuild plans the plug up front when the creator has none yet', () => {
    const old = [{ ...clipPlan(storyOf())[0], blockIds: ['h'] }, freeItem('f1', ['f'])];
    const next = rebuildPlan(storyOf('after_hook'), old);
    expect(next.map((p) => p.role)).toEqual(['cover', 'cta', 'point']);
    expect(next[1].blockIds).toEqual([]);
  });

  it('recover keeps a recorded plug in its place and plans one after the hook when missing', () => {
    const b = storyOf('after_hook');
    const plan = clipPlan(b);
    const r = record(emptyVideoDocument(), withFreeClip(plan, freeItem('fa'), true), [plan[0].id, plan[1].id, 'fa']);
    const synced = syncPlanOverlays(r.doc, r.items);
    const back = recoverPlan(b, synced, clipPlan(b));
    expect(back.map((p) => p.role)).toEqual(['cover', 'cta', 'point']);
    const onlyHook = record(emptyVideoDocument(), plan, [plan[0].id]);
    const back2 = recoverPlan(b, syncPlanOverlays(onlyHook.doc, onlyHook.items), clipPlan(b));
    expect(back2.map((p) => p.role)).toEqual(['cover', 'cta']);
  });

  const handheldAt = (place?: 'after_hook' | 'end' | 'any') =>
    brief({
      postTypeKey: 'numbered_tips',
      slides: [slide('cover', '3 tips', 'Say it'), slide('point', '1. One', 'a'), { ...slide('cta', '2. Plug', 'I use it'), ...(place ? { place } : {}) }, slide('point', '3. Two', 'b')],
    });

  it('handheld locks the plug clip right after the hook or last, and keeps the manager spot for any', () => {
    expect(clipPlan(handheldAt('after_hook'), 'seed').map((p) => p.role)).toEqual(['cover', 'cta', 'point', 'point']);
    expect(clipPlan(handheldAt('after_hook'), 'seed')[1].text).toBe('1. Plug');
    expect(clipPlan(handheldAt('end'), 'seed').map((p) => p.role)).toEqual(['cover', 'point', 'point', 'cta']);
    expect(clipPlan(handheldAt('end'), 'seed')[3].text).toBe('3. Plug');
    expect(clipPlan(handheldAt('any'), 'seed')[2].role).toBe('cta');
    expect(clipPlan(handheldAt(), 'seed')[2].role).toBe('cta');
    expect(plugFirst(handheldAt('after_hook'))).toBe(true);
    expect(briefRev(handheldAt('end'))).not.toBe(briefRev(handheldAt()));
  });

  it('lockPlan moves a locked plug item and leaves one the creator places', () => {
    const plan = clipPlan(handheldAt('any'), 'seed');
    expect(lockPlan(plan, 'any')).toBe(plan);
    expect(lockPlan(plan, 'end').map((p) => p.role)).toEqual(['cover', 'point', 'point', 'cta']);
    expect(lockPlan(plan, 'after_hook').map((p) => p.role)).toEqual(['cover', 'cta', 'point', 'point']);
  });

  it('lockPlug snaps the plug clips back on the timeline when locked', () => {
    const plan = clipPlan(handheldAt('any'), 'seed');
    const r = record(emptyVideoDocument(), plan, plan.map((p) => p.id));
    expect(order(r.doc, r.items)).toEqual([0, 1, 2, 3]);
    expect(lockPlug(r.doc, r.items, 'any')).toBe(r.doc);
    expect(order(lockPlug(r.doc, r.items, 'end'), r.items)).toEqual([0, 1, 3, 2]);
    expect(order(lockPlug(r.doc, r.items, 'after_hook'), r.items)).toEqual([0, 2, 1, 3]);
    const ended = lockPlug(r.doc, r.items, 'end');
    expect(lockPlug(ended, r.items, 'end')).toBe(ended);
  });

  it('handheld keeps the CTA clip at the manager index when it is right after the hook', () => {
    const b = brief({
      postTypeKey: 'numbered_tips',
      slides: [slide('cover', '3 tips', 'Say it'), slide('cta', '1. Plug', 'I use it'), slide('point', '2. One', 'a'), slide('point', '3. Two', 'b')],
    });
    const plan = clipPlan(b, 'seed');
    expect(plan[1]).toMatchObject({ role: 'cta', slideIndex: 1, text: '1. Plug' });
    expect(plan.slice(1).map((p) => p.text.match(/^\d+/)?.[0])).toEqual(['1', '2', '3']);
  });
});
