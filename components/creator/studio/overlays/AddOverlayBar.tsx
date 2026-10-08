// The two ways to pop something over the video: Text drops a box at the
// playhead and opens its words; Picture asks where the image comes from.
import { useState, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  addAsset,
  addOverlay,
  defaultOverlayWindow,
  documentDurationMs,
  MAX_OVERLAYS,
  newId,
  type ImageOverlay,
  type MediaAsset,
  type TextOverlay,
  type VideoDocument,
} from '../../../../lib/edit-document';
import { DEFAULT_SHOT_PLACEMENT } from '../../../../lib/media-library-api';
import { CLASSIC_TEXT_COLOR } from '../../../../lib/overlay-boxes';
import { useStudioStore } from '../../../../lib/studio-store';
import { color, radius, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { beginGesture, commitVideo, selectOverlay, updateGesture } from './overlay-actions';
import { useOverlayUi } from './overlay-ui-store';
import { PicturePickerSheet, type PicturePick } from './PicturePickerSheet';

const TEXT_DEFAULTS = { size: 0.05, x: 0.5, y: 0.3 } as const;

export type AddOverlayBarProps = { doc: VideoDocument; companyId: string };

export function AddOverlayBar(props: AddOverlayBarProps): JSX.Element {
  const { doc, companyId } = props;
  const [picking, setPicking] = useState(false);
  const canAdd = doc.overlays.length < MAX_OVERLAYS && documentDurationMs(doc) > 0;

  function addText() {
    const store = useStudioStore.getState();
    const overlay: TextOverlay = {
      kind: 'text',
      id: newId('o'),
      text: '',
      color: CLASSIC_TEXT_COLOR,
      bg: false,
      ...TEXT_DEFAULTS,
      ...defaultOverlayWindow(doc, store.playheadMs),
    };
    // Added inside a gesture the edit sheet finishes, so Cancel leaves no trace.
    beginGesture();
    updateGesture((d) => addOverlay(d, overlay));
    store.setPlayhead(overlay.startMs);
    selectOverlay(overlay.id);
    useOverlayUi.getState().openEditor(overlay.id);
  }

  function addPicture(pick: PicturePick) {
    setPicking(false);
    const store = useStudioStore.getState();
    const asset: MediaAsset = {
      id: newId('a'),
      kind: 'image',
      localUri: pick.localUri,
      storagePath: pick.storagePath,
      durationMs: null,
      width: pick.width,
      height: pick.height,
    };
    const overlay: ImageOverlay = {
      kind: 'image',
      id: newId('o'),
      assetId: asset.id,
      x: DEFAULT_SHOT_PLACEMENT.x,
      y: DEFAULT_SHOT_PLACEMENT.y,
      width: DEFAULT_SHOT_PLACEMENT.w,
      ...defaultOverlayWindow(doc, store.playheadMs),
    };
    commitVideo((d) => (d.overlays.length >= MAX_OVERLAYS ? d : addOverlay(addAsset(d, asset), overlay)));
    store.setPlayhead(overlay.startMs);
    selectOverlay(overlay.id);
  }

  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Add text"
        onPress={addText}
        disabled={!canAdd}
        style={[styles.btn, !canAdd && styles.btnOff]}
      >
        <Icon name="pencil" size={16} color={color.white} />
        <Text style={styles.btnText}>Text</Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Add picture"
        onPress={() => setPicking(true)}
        disabled={!canAdd}
        style={[styles.btn, !canAdd && styles.btnOff]}
      >
        <Icon name="image" size={16} color={color.white} />
        <Text style={styles.btnText}>Picture</Text>
      </PressableScale>
      {picking ? (
        <PicturePickerSheet companyId={companyId} onPick={addPicture} onClose={() => setPicking(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  btnOff: {
    opacity: 0.4,
  },
  btnText: {
    color: color.white,
    fontSize: type.size.chip,
    fontWeight: '600',
  },
});
