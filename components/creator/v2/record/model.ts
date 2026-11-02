// Record flow model (V2Library.jsx RecordScreen): kept clips per slot, the
// green screen picks, and the local draft that survives an app restart.
// Server drafts (recording_drafts) carry the same clips once uploaded.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clipTexts, stText, type Brief, type BriefClip, type GsMedia, type StText } from '../../../../lib/brief-library';
import { emptyVideoDocument, type Block, type MediaAsset, type Overlay, type VideoDocument } from '../../../../lib/edit-document';
import { toTextOverlay } from '../../../../lib/brief-template-doc';

export type RecordMode = 'free' | 'outline' | 'guided';

export type RecordClip = {
  /** Guided: the template clip index. Free and outline: the order recorded. */
  slot: number;
  asset: MediaAsset;
  /** Green screen picture or video behind this clip, when one was picked. */
  gs: GsMedia | null;
};

export type RecordDraft = {
  clips: (RecordClip | null)[];
  gsMap: Record<number, GsMedia>;
  myText: string;
  ci: number;
  assignmentId: string | null;
};

const KEY = (k: string) => `noni.record.${k}`;

export async function loadRecordDraft(key: string): Promise<RecordDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(key));
    if (!raw) return null;
    const d = JSON.parse(raw) as RecordDraft;
    return Array.isArray(d.clips) ? d : null;
  } catch {
    return null;
  }
}

export function saveRecordDraft(key: string, d: RecordDraft): void {
  AsyncStorage.setItem(KEY(key), JSON.stringify(d)).catch(() => undefined);
}

export function clearRecordDraft(key: string): void {
  AsyncStorage.removeItem(KEY(key)).catch(() => undefined);
}

/** "0:07" from seconds. */
export function clock(s: number): string {
  return `0:${String(Math.max(0, Math.floor(s))).padStart(2, '0')}`;
}

/** The words shown over the camera for a clip: the clip's own text document, else its on-screen line in TikTok classic. */
export function clipScreenTexts(c: BriefClip | null, override?: { text: string; seven: boolean }): StText[] {
  if (override && override.seven) {
    const multi = /\n/.test(override.text);
    return override.text ? [stText(override.text, { x: 50, y: 44, w: multi ? 86 : 90, size: multi ? 15 : 24, style: 'outline' })] : [];
  }
  if (!c) return [];
  const own = clipTexts(c);
  if (own.length) return own;
  return c.onScreen ? [stText(c.onScreen, { x: 50, y: 26, w: 90, size: 22, style: 'outline' })] : [];
}

/** Something <Image> or the native player can open. */
function fileUri(src: string | null | undefined): string | null {
  if (!src) return null;
  return /^(file:|ph:|assets-library:|content:|https?:|data:)/.test(src) ? src : null;
}

/**
 * The kept clips as a studio timeline for the editor: one block per clip in
 * slot order, the template's on-screen text spanning its clip, a picked green
 * screen picture in the overlay slot. Scripts per block id ride beside it.
 */
export function recordToDoc(clips: RecordClip[], brief: Brief | null, override?: { text: string; seven: boolean }): { doc: VideoDocument; scripts: Record<string, string> } {
  const base = emptyVideoDocument();
  const assets: MediaAsset[] = [];
  const blocks: Block[] = [];
  const overlays: Overlay[] = [];
  const scripts: Record<string, string> = {};
  let at = 0;
  const ordered = [...clips].sort((a, b) => a.slot - b.slot);
  for (const clip of ordered) {
    const ms = Math.max(300, clip.asset.durationMs ?? 1000);
    const blockId = `b-${clip.slot}-${clip.asset.id}`;
    assets.push(clip.asset);
    blocks.push({ id: blockId, layout: 'single', cells: [{ id: `cell-${blockId}`, assetId: clip.asset.id, inMs: 0, outMs: ms, speed: 1, muted: false, crop: null }] });
    const tc = brief?.clips?.[clip.slot] ?? null;
    if (tc?.text) scripts[blockId] = tc.text;
    for (const t of clipScreenTexts(tc, override)) overlays.push(toTextOverlay({ ...t, id: `${t.id}-${clip.slot}` }, at, at + ms));
    const gs = clip.gs;
    const uri = gs && gs.kind === 'image' ? fileUri(gs.src) : null;
    if (gs && uri) {
      const pic: MediaAsset = { id: `gs-${blockId}`, kind: 'image', localUri: uri, storagePath: null, durationMs: null, width: null, height: null };
      assets.push(pic);
      overlays.push({ kind: 'image', id: `o-${pic.id}`, assetId: pic.id, x: 0.5, y: 0.5, width: 0.4, startMs: at, endMs: at + ms });
    }
    at += ms;
  }
  return { doc: { ...base, assets, blocks, overlays, subtitles: { ...base.subtitles, enabled: false } }, scripts };
}

/** Editor hand-off facts the camera leaves for the editor route. */
export type EditHandoff = { title: string; scripts: Record<string, string>; draftKey: string | null };

export async function loadEditHandoff(assignmentId: string): Promise<EditHandoff | null> {
  try {
    const raw = await AsyncStorage.getItem(`noni.edit.${assignmentId}`);
    return raw ? (JSON.parse(raw) as EditHandoff) : null;
  } catch {
    return null;
  }
}

export function saveEditHandoff(assignmentId: string, h: EditHandoff): Promise<void> {
  return AsyncStorage.setItem(`noni.edit.${assignmentId}`, JSON.stringify(h)).catch(() => undefined);
}
