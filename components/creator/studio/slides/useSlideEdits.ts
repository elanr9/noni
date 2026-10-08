import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  moveSlide,
  removeSlide,
  updateSlide,
  type MediaAsset,
  type Slide,
  type SlideCrop,
  type SlideshowDocument,
} from '../../../../lib/edit-document';
import type { OverlayBox } from '../../../../lib/overlay-boxes';
import type { SlidePlatform } from '../../../../lib/submissions';
import { onSlideshow, useStudioStore } from '../../../../lib/studio-store';
import { appendPhotoSlides, newTextBox, patchBox, withSlideCrop, type BoxPatch } from './slide-edits';

type SlideUpdate = (doc: SlideshowDocument) => SlideshowDocument;

export type ReorderHandlers = {
  onBegin: (slideId: string) => void;
  onOver: (slideId: string, toIndex: number) => void;
  onEnd: () => void;
};

export type SlideEdits = {
  current: Slide | null;
  index: number;
  selectedBoxId: string | null;
  /** The box just added; its edit panel takes focus. */
  freshBoxId: string | null;
  addPhotos: (assets: MediaAsset[]) => void;
  jumpTo: (slideId: string) => void;
  removeCurrent: () => void;
  reorder: ReorderHandlers;
  addBox: () => void;
  selectBox: (boxId: string) => void;
  deselectBox: () => void;
  changeBox: (boxId: string, patch: BoxPatch) => void;
  editBox: (box: OverlayBox) => void;
  deleteBox: (boxId: string) => void;
  finishEditing: (finalText: string) => void;
  setCrop: (platform: SlidePlatform, crop: SlideCrop) => void;
};

function selectSlide(slideId: string, boxId: string | null): void {
  useStudioStore.getState().select({ kind: 'slide', slideId, boxId });
}

function slideshowFromStore(): SlideshowDocument | null {
  const doc = useStudioStore.getState().document;
  return doc?.format === 'slideshow' ? doc : null;
}

/**
 * Every slideshow write for the editor. A selected text box is one editing
 * session (gestureBegin on select, gestureEnd on deselect) so typing and
 * nudging a box lands as a single undo step; everything else commits.
 */
export function useSlideEdits(doc: SlideshowDocument): SlideEdits {
  const selection = useStudioStore((s) => s.selection);
  const slideSelection = selection?.kind === 'slide' ? selection : null;
  const current = doc.slides.find((s) => s.id === slideSelection?.slideId) ?? doc.slides[0] ?? null;
  const index = current ? doc.slides.indexOf(current) : -1;
  const selectedBoxId =
    current !== null && slideSelection !== null && slideSelection.slideId === current.id
      ? slideSelection.boxId
      : null;
  const [freshBoxId, setFreshBoxId] = useState<string | null>(null);
  const session = useRef(false);

  const beginSession = useCallback(() => {
    if (session.current) return;
    session.current = true;
    useStudioStore.getState().gestureBegin();
  }, []);

  const endSession = useCallback(() => {
    if (!session.current) return;
    session.current = false;
    useStudioStore.getState().gestureEnd();
  }, []);

  useEffect(() => {
    if (selectedBoxId === null) endSession();
  }, [selectedBoxId, endSession]);

  useEffect(() => endSession, [endSession]);

  const write = useCallback((update: SlideUpdate) => {
    const { gestureBase, gestureUpdate, commit } = useStudioStore.getState();
    (gestureBase ? gestureUpdate : commit)(onSlideshow(update));
  }, []);

  const withBoxes = useCallback(
    (slideId: string, map: (boxes: OverlayBox[]) => OverlayBox[]) => {
      write((d) => {
        const slide = d.slides.find((s) => s.id === slideId);
        return slide ? updateSlide(d, slideId, { boxes: map(slide.boxes) }) : d;
      });
    },
    [write],
  );

  const deselectBox = useCallback(() => {
    endSession();
    setFreshBoxId(null);
    if (current) selectSlide(current.id, null);
  }, [current, endSession]);

  const jumpTo = useCallback(
    (slideId: string) => {
      endSession();
      setFreshBoxId(null);
      selectSlide(slideId, null);
    },
    [endSession],
  );

  const addPhotos = useCallback(
    (assets: MediaAsset[]) => {
      if (assets.length === 0) return;
      endSession();
      write((d) => appendPhotoSlides(d, assets));
      const next = slideshowFromStore();
      const last = next?.slides[next.slides.length - 1];
      if (last) selectSlide(last.id, null);
    },
    [endSession, write],
  );

  const removeCurrent = useCallback(() => {
    if (!current) return;
    const slideId = current.id;
    const at = index;
    Alert.alert('Remove this slide?', 'The photo and its text come off the post.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          endSession();
          setFreshBoxId(null);
          write((d) => removeSlide(d, slideId));
          const next = slideshowFromStore();
          const neighbour = next?.slides[Math.min(at, next.slides.length - 1)];
          if (neighbour) selectSlide(neighbour.id, null);
          else useStudioStore.getState().select(null);
        },
      },
    ]);
  }, [current, index, endSession, write]);

  const reorder: ReorderHandlers = {
    onBegin: (slideId) => {
      endSession();
      setFreshBoxId(null);
      selectSlide(slideId, null);
      useStudioStore.getState().gestureBegin();
    },
    onOver: (slideId, toIndex) => {
      useStudioStore.getState().gestureUpdate(onSlideshow((d) => moveSlide(d, slideId, toIndex)));
    },
    onEnd: () => useStudioStore.getState().gestureEnd(),
  };

  const addBox = useCallback(() => {
    if (!current) return;
    const slideId = current.id;
    const box = newTextBox(current.boxes);
    endSession();
    withBoxes(slideId, (boxes) => [...boxes, box]);
    selectSlide(slideId, box.id);
    beginSession();
    setFreshBoxId(box.id);
  }, [current, endSession, withBoxes, beginSession]);

  const selectBox = useCallback(
    (boxId: string) => {
      if (!current) return;
      if (selectedBoxId !== boxId) endSession();
      setFreshBoxId(null);
      selectSlide(current.id, boxId);
      beginSession();
    },
    [current, selectedBoxId, endSession, beginSession],
  );

  const changeBox = useCallback(
    (boxId: string, patch: BoxPatch) => {
      if (current) withBoxes(current.id, (boxes) => patchBox(boxes, boxId, patch));
    },
    [current, withBoxes],
  );

  const editBox = useCallback(
    (box: OverlayBox) => {
      if (current) withBoxes(current.id, (boxes) => boxes.map((b) => (b.id === box.id ? box : b)));
    },
    [current, withBoxes],
  );

  const deleteBox = useCallback(
    (boxId: string) => {
      if (!current) return;
      withBoxes(current.id, (boxes) => boxes.filter((b) => b.id !== boxId));
      deselectBox();
    },
    [current, withBoxes, deselectBox],
  );

  const finishEditing = useCallback(
    (finalText: string) => {
      if (selectedBoxId !== null && finalText.trim().length === 0) deleteBox(selectedBoxId);
      else deselectBox();
    },
    [selectedBoxId, deleteBox, deselectBox],
  );

  const setCrop = useCallback(
    (platform: SlidePlatform, crop: SlideCrop) => {
      if (current) write((d) => withSlideCrop(d, current.id, platform, crop));
    },
    [current, write],
  );

  return {
    current,
    index,
    selectedBoxId,
    freshBoxId,
    addPhotos,
    jumpTo,
    removeCurrent,
    reorder,
    addBox,
    selectBox,
    deselectBox,
    changeBox,
    editBox,
    deleteBox,
    finishEditing,
    setCrop,
  };
}
