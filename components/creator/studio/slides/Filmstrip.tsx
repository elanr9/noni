import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { MAX_SLIDES, assetById, type MediaAsset, type Slide, type SlideshowDocument } from '../../../../lib/edit-document';
import { SLIDE_ASPECT_RATIO } from '../../../../lib/submissions';
import { color, type } from '../../../../theme/tokens';
import { photoLayout } from '../../slides/photo-crop';
import { AddPhotosButton } from './AddPhotosButton';
import { useAssetUri } from './asset-uri';
import type { ReorderHandlers } from './useSlideEdits';

const STRIP_HEIGHT = 64;
const GAP = 8;
const LONG_PRESS_MS = 220;
const RADIUS = 8;

function FilmstripItem(props: {
  slide: Slide;
  asset: MediaAsset | null;
  index: number;
  count: number;
  width: number;
  selected: boolean;
  onSelect: () => void;
  reorder: ReorderHandlers;
  onDragging: (on: boolean) => void;
}): JSX.Element {
  const { slide, asset, index, count, width, selected, onSelect, reorder, onDragging } = props;
  const uri = useAssetUri(asset);
  const slot = width + GAP;
  const tx = useSharedValue(0);
  const active = useSharedValue(false);
  const startIndex = useSharedValue(index);
  const liveIndex = useSharedValue(index);
  const renderedIndex = useSharedValue(index);

  useEffect(() => {
    renderedIndex.value = index;
  }, [index, renderedIndex]);

  const begin = () => {
    onDragging(true);
    reorder.onBegin(slide.id);
  };
  const over = (toIndex: number) => reorder.onOver(slide.id, toIndex);
  const end = () => {
    onDragging(false);
    reorder.onEnd();
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      startIndex.value = renderedIndex.value;
      liveIndex.value = renderedIndex.value;
      active.value = true;
      runOnJS(begin)();
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      const target = Math.max(0, Math.min(count - 1, Math.round(startIndex.value + e.translationX / slot)));
      if (target !== liveIndex.value) {
        liveIndex.value = target;
        runOnJS(over)(target);
      }
    })
    .onFinalize(() => {
      // The item now sits at its new index; fold the finger offset into tx and ease home.
      tx.value = tx.value + (startIndex.value - renderedIndex.value) * slot;
      active.value = false;
      tx.value = withTiming(0, { duration: 160 });
      runOnJS(end)();
    });
  const tap = Gesture.Tap().onEnd(() => runOnJS(onSelect)());
  const gesture = Gesture.Race(pan, tap);

  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value + (active.value ? (startIndex.value - renderedIndex.value) * slot : 0) },
      { scale: withTiming(active.value ? 1.08 : 1, { duration: 120 }) },
    ],
    zIndex: active.value ? 10 : 0,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel={`Slide ${index + 1}`}
        accessibilityState={{ selected }}
        style={[styles.item, { width }, animated]}
      >
        {uri !== null ? (
          <Image
            source={{ uri }}
            style={slide.crop ? [styles.photo, photoLayout(slide.crop, width, STRIP_HEIGHT)] : StyleSheet.absoluteFill}
            resizeMode={slide.crop ? 'stretch' : 'cover'}
          />
        ) : null}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{index + 1}</Text>
        </View>
        {selected ? <View style={styles.ring} pointerEvents="none" /> : null}
      </Animated.View>
    </GestureDetector>
  );
}

/** Thumbnail row: tap to jump, hold and drag to reorder, add more at the end. */
export function Filmstrip(props: {
  doc: SlideshowDocument;
  currentId: string | null;
  onSelect: (slideId: string) => void;
  reorder: ReorderHandlers;
  onAdd: (assets: MediaAsset[]) => void;
}): JSX.Element {
  const { doc, currentId, onSelect, reorder, onAdd } = props;
  const [dragging, setDragging] = useState(false);
  const width = Math.max(36, Math.round(STRIP_HEIGHT * SLIDE_ASPECT_RATIO[doc.aspect]));

  return (
    <ScrollView
      horizontal
      scrollEnabled={!dragging}
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
    >
      {doc.slides.map((slide, i) => (
        <FilmstripItem
          key={slide.id}
          slide={slide}
          asset={assetById(doc, slide.assetId)}
          index={i}
          count={doc.slides.length}
          width={width}
          selected={slide.id === currentId}
          onSelect={() => onSelect(slide.id)}
          reorder={reorder}
          onDragging={setDragging}
        />
      ))}
      <AddPhotosButton
        variant="chip"
        remaining={MAX_SLIDES - doc.slides.length}
        onAdd={onAdd}
        chipSize={{ width, height: STRIP_HEIGHT }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: GAP,
    alignItems: 'center',
  },
  item: {
    height: STRIP_HEIGHT,
    borderRadius: RADIUS,
    overflow: 'hidden',
    backgroundColor: color.ink800,
  },
  photo: {
    position: 'absolute',
  },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: color.inkA55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: color.white,
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    borderWidth: 2,
    borderColor: color.white,
  },
});
