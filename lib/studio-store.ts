// Studio state: the edit document with undo history, plus the transient UI
// state every panel shares (playhead, selection, playing). Every document
// change goes through commit() or a gesture; nothing writes the document
// directly, so undo and autosave always see a consistent history.
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import type { EditDocument, SlideshowDocument, VideoDocument } from './edit-document';
import { saveProject } from './projects-api';

export type StudioSelection =
  | { kind: 'block'; blockId: string; cellIndex: number }
  | { kind: 'overlay'; overlayId: string }
  | { kind: 'slide'; slideId: string; boxId: string | null };

type StudioState = {
  document: EditDocument | null;
  past: EditDocument[];
  future: EditDocument[];
  /** Document as it was when the current gesture started; null when idle. */
  gestureBase: EditDocument | null;
  /** True when the document differs from what was last saved. */
  dirty: boolean;
  selection: StudioSelection | null;
  playheadMs: number;
  playing: boolean;

  load(document: EditDocument): void;
  /** Apply an edit and record it for undo. No-op when nothing changed. */
  commit(update: (doc: EditDocument) => EditDocument): void;
  /** Live edits during a drag: update without history until gestureEnd. */
  gestureBegin(): void;
  gestureUpdate(update: (doc: EditDocument) => EditDocument): void;
  gestureEnd(): void;
  undo(): void;
  redo(): void;
  markSaved(saved: EditDocument): void;
  select(selection: StudioSelection | null): void;
  setPlayhead(positionMs: number): void;
  setPlaying(playing: boolean): void;
};

const HISTORY_LIMIT = 100;

export const useStudioStore = create<StudioState>((set, get) => ({
  document: null,
  past: [],
  future: [],
  gestureBase: null,
  dirty: false,
  selection: null,
  playheadMs: 0,
  playing: false,

  load(document) {
    set({ document, past: [], future: [], gestureBase: null, dirty: false, selection: null, playheadMs: 0, playing: false });
  },

  commit(update) {
    const { document, past } = get();
    if (!document) return;
    const next = update(document);
    if (next === document) return;
    set({ document: next, past: [...past, document].slice(-HISTORY_LIMIT), future: [], dirty: true });
  },

  gestureBegin() {
    const { document, gestureBase } = get();
    if (!document || gestureBase) return;
    set({ gestureBase: document });
  },

  gestureUpdate(update) {
    const { document, gestureBase } = get();
    if (!document || !gestureBase) return;
    const next = update(document);
    if (next !== document) set({ document: next });
  },

  gestureEnd() {
    const { document, gestureBase, past } = get();
    if (!document || !gestureBase) return;
    if (document === gestureBase) {
      set({ gestureBase: null });
      return;
    }
    set({ gestureBase: null, past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [], dirty: true });
  },

  undo() {
    const { document, past, future } = get();
    if (!document || past.length === 0) return;
    const previous = past[past.length - 1];
    set({ document: previous, past: past.slice(0, -1), future: [document, ...future], dirty: true, selection: null });
  },

  redo() {
    const { document, past, future } = get();
    if (!document || future.length === 0) return;
    const [next, ...rest] = future;
    set({ document: next, past: [...past, document], future: rest, dirty: true, selection: null });
  },

  markSaved(saved) {
    if (get().document === saved) set({ dirty: false });
  },

  select(selection) {
    set({ selection });
  },

  setPlayhead(positionMs) {
    set({ playheadMs: Math.max(0, Math.round(positionMs)) });
  },

  setPlaying(playing) {
    set({ playing });
  },
}));

/** Selector for screens that know they hold a video document. */
export function useVideoDocument(): VideoDocument | null {
  return useStudioStore((s) => (s.document?.format === 'video' ? s.document : null));
}

export function useSlideshowDocument(): SlideshowDocument | null {
  return useStudioStore((s) => (s.document?.format === 'slideshow' ? s.document : null));
}

/** Narrowing helper for commit() callers that edit a video document. */
export function onVideo(update: (doc: VideoDocument) => VideoDocument): (doc: EditDocument) => EditDocument {
  return (doc) => (doc.format === 'video' ? update(doc) : doc);
}

export function onSlideshow(
  update: (doc: SlideshowDocument) => SlideshowDocument,
): (doc: EditDocument) => EditDocument {
  return (doc) => (doc.format === 'slideshow' ? update(doc) : doc);
}

const AUTOSAVE_DELAY_MS = 1500;

/** Debounced save of the document to creator_projects whenever it changes
 * outside of an active gesture. Failures are logged and retried on the
 * next change; the document stays dirty so submit can force a save. */
export function useProjectAutosave(params: { companyId: string; creatorId: string; assignmentId: string } | null): void {
  const document = useStudioStore((s) => s.document);
  const dirty = useStudioStore((s) => s.dirty);
  const gestureBase = useStudioStore((s) => s.gestureBase);
  const markSaved = useStudioStore((s) => s.markSaved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!params || !document || !dirty || gestureBase) return;
    if (timer.current) clearTimeout(timer.current);
    const snapshot = document;
    timer.current = setTimeout(() => {
      saveProject({ ...params, document: snapshot })
        .then(() => markSaved(snapshot))
        .catch((e: unknown) => console.warn('project autosave failed', e));
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [params, document, dirty, gestureBase, markSaved]);
}
