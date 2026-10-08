// One text pop-up on the stage, drawn by the shared OverlayTextBox so it
// matches the slide boxes and the server render exactly.
import { memo, useRef, type JSX } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { updateOverlay, type TextOverlay } from '../../../../lib/edit-document';
import {
  MAX_BOX_SIZE,
  MAX_BOX_WIDTH,
  MIN_BOX_SIZE,
  MIN_BOX_WIDTH,
} from '../../../../lib/overlay-boxes';
import { color } from '../../../../theme/tokens';
import { OverlayTextBox, overlayMinWrapWidth, overlayWrapWidth } from '../../../ui/OverlayTextBox';
import { useWidthDrag, type WidthDrag } from '../../slides/GestureItem';
import {
  applyGesture,
  beginGesture,
  confirmDeleteOverlay,
  endGesture,
  selectOverlay,
} from './overlay-actions';
import { useOverlayUi } from './overlay-ui-store';
import { useStageGesture } from './useStageGesture';
import { WidthHandles } from './WidthHandles';

const HIT_SLOP = 14;

export type TextOverlayItemProps = {
  overlay: TextOverlay;
  stageWidth: number;
  stageHeight: number;
  selected: boolean;
};

export const TextOverlayItem = memo(function TextOverlayItem(props: TextOverlayItemProps): JSX.Element {
  const { overlay, stageWidth, stageHeight, selected } = props;
  const fontSize = stageWidth * overlay.size;
  const contentWidth = useRef(0);

  const { liveWidth, drag } = useWidthDrag({
    start: () => contentWidth.current,
    min: () =>
      Math.max(MIN_BOX_WIDTH * stageWidth, overlayMinWrapWidth(overlay.text, overlay.bg, fontSize)),
    max: () => MAX_BOX_WIDTH * stageWidth,
    onStart: beginGesture,
    onCommit: (px) =>
      applyGesture((doc) => updateOverlay(doc, overlay.id, { width: px / stageWidth })),
  });
  const widthDrag: WidthDrag = {
    ...drag,
    onEnd: () => {
      drag.onEnd();
      endGesture();
    },
    onCancel: () => {
      drag.onCancel();
      endGesture();
    },
  };

  const { gesture, itemStyle, guideStyle, dragOutlineStyle } = useStageGesture({
    x: overlay.x,
    y: overlay.y,
    size: overlay.size,
    stageWidth,
    stageHeight,
    minRatio: MIN_BOX_SIZE / overlay.size,
    maxRatio: MAX_BOX_SIZE / overlay.size,
    onMove: (x, y) => applyGesture((doc) => updateOverlay(doc, overlay.id, { x, y })),
    onScale: (ratio, x, y) =>
      applyGesture((doc) => updateOverlay(doc, overlay.id, { size: overlay.size * ratio, x, y })),
    onTap: () => {
      if (selected) useOverlayUi.getState().openEditor(overlay.id);
      else selectOverlay(overlay.id);
    },
    onLongPress: () => confirmDeleteOverlay(overlay.id, 'this text'),
  });

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View style={[styles.guide, guideStyle]} pointerEvents="none" />
      <GestureDetector gesture={gesture}>
        <Animated.View
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Text ${overlay.text}`}
          accessibilityState={{ selected }}
          style={itemStyle}
        >
          <View
            onLayout={(e) => {
              contentWidth.current = e.nativeEvent.layout.width;
            }}
          >
            <OverlayTextBox
              text={overlay.text.length === 0 ? ' ' : overlay.text}
              color={overlay.color}
              bg={overlay.bg}
              fontSize={fontSize}
              maxWidth={liveWidth ?? overlayWrapWidth(overlay.width, stageWidth)}
            />
          </View>
          <WidthHandles visible={selected} drag={widthDrag} />
          {selected ? <View style={styles.selectedOutline} pointerEvents="none" /> : null}
          <Animated.View pointerEvents="none" style={[styles.dragOutline, dragOutlineStyle]} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    marginLeft: -0.5,
    backgroundColor: color.whiteA45,
  },
  selectedOutline: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.white,
  },
  dragOutline: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.whiteA75,
    borderStyle: 'dashed',
  },
});
