// One block on the strip: a lane per cell with its poster frames, the
// duration badge, mute marks, selection ring, trim handles when selected,
// tap to select a cell and long press drag to reorder.
import { memo, useLayoutEffect, useMemo, useRef, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { assetById, type VideoDocument } from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { formatSeconds } from '../../../../lib/video-edit';
import { color, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { BlockThumbs } from './BlockThumbs';
import { BLOCK_RADIUS, LANE_GAP, TRACK_H, laneHeight, type BlockItem } from './layout';
import { TrimHandles, type TrimStartInfo } from './TrimHandles';

const REORDER_HOLD_MS = 350;

export const BlockStrip = memo(function BlockStrip(props: {
  item: BlockItem;
  doc: VideoDocument;
  index: number;
  count: number;
  msPerPx: number;
  /** Selected cell index, or null when another block (or nothing) is selected. */
  selectedCell: number | null;
  scrollGesture: GestureType;
  onTrimStart: (info: TrimStartInfo) => void;
  onTrimEnd: () => void;
  onReorderStart: (blockId: string) => void;
  onReorderEnd: (blockId: string, centerX: number) => void;
}): JSX.Element {
  const { item, doc, index, count, msPerPx, selectedCell, scrollGesture } = props;
  const { block, startMs, endMs } = item.range;
  const laneH = laneHeight(block.cells.length);
  const selected = selectedCell !== null;

  const translateX = useSharedValue(0);
  const dragging = useSharedValue(false);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: withTiming(dragging.value ? 1.04 : 1, { duration: 120 }) }],
    zIndex: dragging.value ? 20 : selected ? 2 : 0,
    opacity: dragging.value ? 0.9 : 1,
  }));

  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        const { item: current, selectedCell: cell } = latest.current;
        const cells = current.range.block.cells.length;
        const cellIndex = cells > 1 && e.y > laneHeight(cells) + LANE_GAP / 2 ? 1 : 0;
        const { select } = useStudioStore.getState();
        if (cell === cellIndex) select(null);
        else select({ kind: 'block', blockId: current.range.block.id, cellIndex });
      });
    const reorder = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(REORDER_HOLD_MS)
      .onStart(() => {
        const id = latest.current.item.range.block.id;
        dragging.value = true;
        useStudioStore.getState().select({ kind: 'block', blockId: id, cellIndex: 0 });
        latest.current.onReorderStart(id);
      })
      .onUpdate((e) => {
        translateX.value = e.translationX;
      })
      .onEnd((e) => {
        const current = latest.current.item;
        latest.current.onReorderEnd(current.range.block.id, current.x + current.width / 2 + e.translationX);
      })
      .onFinalize(() => {
        dragging.value = false;
        translateX.value = 0;
      });
    return Gesture.Race(reorder, tap);
  }, [dragging, translateX]);

  return (
    <Animated.View style={[styles.wrap, { left: item.x, width: item.width }, animated]}>
      <GestureDetector gesture={gesture}>
        <View
          accessibilityRole="button"
          accessibilityLabel={`Clip ${index + 1} of ${count}, ${((endMs - startMs) / 1000).toFixed(1)} seconds`}
          accessibilityState={{ selected }}
          style={[styles.block, selected && styles.blockSelected]}
        >
          {block.cells.map((cell, cellIndex) => {
            const asset = assetById(doc, cell.assetId);
            const top = cellIndex * (laneH + LANE_GAP);
            const laneSelected = block.cells.length > 1 && selectedCell === cellIndex;
            return (
              <View
                key={cell.id}
                style={[styles.lane, { top, height: laneH }, laneSelected && styles.laneSelected]}
              >
                <BlockThumbs asset={asset} clip={cell} width={item.width} height={laneH} msPerPx={msPerPx} />
                {cell.muted && asset?.kind === 'video' ? (
                  <View style={[styles.muted, { top: Math.max(2, (laneH - 16) / 2) }]} pointerEvents="none">
                    <Icon name="volume-x" size={10} color={color.white} />
                  </View>
                ) : null}
              </View>
            );
          })}
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{formatSeconds(endMs - startMs)}</Text>
          </View>
        </View>
      </GestureDetector>
      {selected
        ? block.cells.map((cell, cellIndex) => (
            <TrimHandles
              key={cell.id}
              blockId={block.id}
              cellIndex={cellIndex}
              laneTop={cellIndex * (laneH + LANE_GAP)}
              laneHeight={laneH}
              msPerPx={msPerPx}
              scrollGesture={scrollGesture}
              onTrimStart={props.onTrimStart}
              onTrimEnd={props.onTrimEnd}
            />
          ))
        : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, height: TRACK_H },
  block: {
    flex: 1,
    marginRight: 1,
    borderRadius: BLOCK_RADIUS,
    overflow: 'hidden',
    backgroundColor: color.ink800,
  },
  blockSelected: { borderWidth: 2, borderColor: color.white },
  lane: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', backgroundColor: color.ink800 },
  laneSelected: { borderWidth: 1.5, borderColor: color.accent },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: color.inkA55,
  },
  badgeText: {
    fontSize: type.size.micro11,
    lineHeight: 14,
    fontWeight: type.weight.semibold,
    color: color.white,
    fontVariant: ['tabular-nums'],
  },
  muted: {
    position: 'absolute',
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.inkA55,
  },
});
