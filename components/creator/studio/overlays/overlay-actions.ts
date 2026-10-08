// Document writes for overlays, all through the studio store so undo and
// autosave see them. Gesture edits open with beginGesture() and close with
// applyGesture(); discrete edits use commitVideo().
import { Alert } from 'react-native';

import { removeOverlay, type VideoDocument } from '../../../../lib/edit-document';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { useOverlayUi } from './overlay-ui-store';

type VideoUpdate = (doc: VideoDocument) => VideoDocument;

export function commitVideo(update: VideoUpdate): void {
  useStudioStore.getState().commit(onVideo(update));
}

export function beginGesture(): void {
  useStudioStore.getState().gestureBegin();
}

export function updateGesture(update: VideoUpdate): void {
  useStudioStore.getState().gestureUpdate(onVideo(update));
}

export function endGesture(): void {
  useStudioStore.getState().gestureEnd();
}

/** Final document for a gesture that only reported on release. */
export function applyGesture(update: VideoUpdate): void {
  const store = useStudioStore.getState();
  store.gestureUpdate(onVideo(update));
  store.gestureEnd();
}

export function selectOverlay(overlayId: string | null): void {
  useStudioStore
    .getState()
    .select(overlayId === null ? null : { kind: 'overlay', overlayId });
}

export function deleteOverlay(overlayId: string): void {
  const store = useStudioStore.getState();
  store.commit(onVideo((doc) => removeOverlay(doc, overlayId)));
  if (store.selection?.kind === 'overlay' && store.selection.overlayId === overlayId) {
    store.select(null);
  }
  if (useOverlayUi.getState().editingOverlayId === overlayId) useOverlayUi.getState().closeEditor();
}

export function confirmDeleteOverlay(overlayId: string, label: string): void {
  Alert.alert(`Delete ${label}?`, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteOverlay(overlayId) },
  ]);
}
