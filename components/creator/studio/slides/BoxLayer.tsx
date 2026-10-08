import { useRef, type JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  MAX_BOX_SIZE,
  MAX_BOX_WIDTH,
  MIN_BOX_SIZE,
  MIN_BOX_WIDTH,
  type OverlayBox,
} from '../../../../lib/overlay-boxes';
import { OverlayTextBox, overlayMinWrapWidth, overlayWrapWidth } from '../../../ui/OverlayTextBox';
import { GestureItem, WidthHandles, useWidthDrag } from '../../slides/GestureItem';
import type { BoxPatch } from './slide-edits';

export type BoxEditing = {
  selectedBoxId: string | null;
  onChange: (boxId: string, patch: BoxPatch) => void;
  onTap: (boxId: string) => void;
  onTapEmpty: () => void;
};

type BoxProps = { box: OverlayBox; stageWidth: number; stageHeight: number };

function EditableBox(props: BoxProps & { editing: BoxEditing }): JSX.Element {
  const { box, stageWidth, stageHeight, editing } = props;
  const fontSize = Math.max(6, box.size * stageWidth);
  const contentWidth = useRef(0);
  const { liveWidth, drag } = useWidthDrag({
    start: () => contentWidth.current,
    min: () => Math.max(MIN_BOX_WIDTH * stageWidth, overlayMinWrapWidth(box.text, box.bg, fontSize)),
    max: () => MAX_BOX_WIDTH * stageWidth,
    onCommit: (px) => editing.onChange(box.id, { width: px / stageWidth }),
  });
  const selected = editing.selectedBoxId === box.id;

  return (
    <GestureItem
      x={box.x}
      y={box.y}
      size={box.size}
      stageWidth={stageWidth}
      stageHeight={stageHeight}
      onMove={(x, y) => editing.onChange(box.id, { x, y })}
      onScale={(ratio, x, y) => editing.onChange(box.id, { size: box.size * ratio, x, y })}
      minScale={MIN_BOX_SIZE / box.size}
      maxScale={MAX_BOX_SIZE / box.size}
      focalPinch
      onTap={() => editing.onTap(box.id)}
      selected={selected}
    >
      <View
        onLayout={(e) => {
          contentWidth.current = e.nativeEvent.layout.width;
        }}
      >
        <OverlayTextBox
          text={box.text}
          color={box.color}
          bg={box.bg}
          fontSize={fontSize}
          maxWidth={liveWidth ?? overlayWrapWidth(box.width, stageWidth)}
        />
      </View>
      <WidthHandles visible={selected} drag={drag} />
    </GestureItem>
  );
}

/** Dimmed, untouchable box shown while the photo is being framed under it. */
function GuideBox(props: BoxProps): JSX.Element {
  const { box, stageWidth, stageHeight } = props;
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
      <View
        style={{
          transform: [
            { translateX: (box.x - 0.5) * stageWidth },
            { translateY: (box.y - 0.5) * stageHeight },
          ],
        }}
      >
        <OverlayTextBox
          text={box.text}
          color={box.color}
          bg={box.bg}
          fontSize={Math.max(6, box.size * stageWidth)}
          maxWidth={overlayWrapWidth(box.width, stageWidth)}
        />
      </View>
    </View>
  );
}

export function BoxLayer(props: {
  boxes: OverlayBox[];
  stageWidth: number;
  stageHeight: number;
  editing: BoxEditing;
  /** Off while the crop layer owns the stage. */
  interactive: boolean;
}): JSX.Element | null {
  const { boxes, stageWidth, stageHeight, editing, interactive } = props;
  if (stageWidth <= 0 || stageHeight <= 0) return null;

  if (!interactive) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.guides]} pointerEvents="none">
        {boxes.map((box) => (
          <GuideBox key={box.id} box={box} stageWidth={stageWidth} stageHeight={stageHeight} />
        ))}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        accessibilityLabel="Deselect text"
        style={StyleSheet.absoluteFill}
        onPress={editing.onTapEmpty}
      />
      {boxes.map((box) => (
        <EditableBox
          key={box.id}
          box={box}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          editing={editing}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  guides: {
    opacity: 0.55,
  },
});
