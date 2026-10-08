// Both trim handles of one cell lane. A drag edits the document live through
// the store gesture API from the document captured at grab time, so the
// total finger travel maps to one trim and never accumulates rounding.
import { useMemo, useRef, type JSX } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { blockRanges, trimCell, type VideoDocument } from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { color } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { useEvent } from '../../editor/useEvent';
import { BLOCK_RADIUS, HANDLE_W } from './layout';

export type TrimEdge = 'in' | 'out';

export type TrimStartInfo = { blockId: string; edge: TrimEdge };

export function TrimHandles(props: {
  blockId: string;
  cellIndex: number;
  laneTop: number;
  laneHeight: number;
  msPerPx: number;
  scrollGesture: GestureType;
  onTrimStart: (info: TrimStartInfo) => void;
  onTrimEnd: () => void;
}): JSX.Element {
  const { blockId, cellIndex, laneTop, laneHeight, msPerPx, scrollGesture, onTrimStart, onTrimEnd } = props;
  const baseRef = useRef<VideoDocument | null>(null);

  const begin = (edge: TrimEdge) => {
    const { document, gestureBegin, setPlaying } = useStudioStore.getState();
    if (!document || document.format !== 'video') return;
    baseRef.current = document;
    setPlaying(false);
    gestureBegin();
    onTrimStart({ blockId, edge });
  };

  const update = (edge: TrimEdge, translationX: number) => {
    const base = baseRef.current;
    if (!base) return;
    const next = trimCell(base, blockId, cellIndex, edge, translationX * msPerPx);
    const { gestureUpdate, setPlayhead } = useStudioStore.getState();
    gestureUpdate(() => next);
    const range = blockRanges(next).find((r) => r.block.id === blockId);
    if (range) setPlayhead(edge === 'in' ? range.startMs : Math.max(range.startMs, range.endMs - 1));
  };

  const end = () => {
    if (!baseRef.current) return;
    baseRef.current = null;
    useStudioStore.getState().gestureEnd();
    onTrimEnd();
  };

  const onBegin = useEvent(begin);
  const onUpdate = useEvent(update);
  const onEnd = useEvent(end);

  const [panIn, panOut] = useMemo(() => {
    const makePan = (edge: TrimEdge) =>
      Gesture.Pan()
        .runOnJS(true)
        .blocksExternalGesture(scrollGesture)
        .onStart(() => onBegin(edge))
        .onUpdate((e) => onUpdate(edge, e.translationX))
        .onFinalize(() => onEnd());
    return [makePan('in'), makePan('out')];
  }, [scrollGesture, onBegin, onUpdate, onEnd]);

  return (
    <>
      <GestureDetector gesture={panIn}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Trim start"
          hitSlop={{ top: 6, bottom: 6, left: 10, right: 4 }}
          style={[styles.handle, styles.left, { top: laneTop, height: laneHeight }]}
        >
          <Icon name="chevron-left" size={14} color={color.ink} />
        </View>
      </GestureDetector>
      <GestureDetector gesture={panOut}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Trim end"
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 10 }}
          style={[styles.handle, styles.right, { top: laneTop, height: laneHeight }]}
        >
          <Icon name="chevron-right" size={14} color={color.ink} />
        </View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  handle: {
    position: 'absolute',
    width: HANDLE_W,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
  },
  left: { left: 0, borderTopLeftRadius: BLOCK_RADIUS, borderBottomLeftRadius: BLOCK_RADIUS },
  right: { right: 0, borderTopRightRadius: BLOCK_RADIUS, borderBottomRightRadius: BLOCK_RADIUS },
});
