// One slideshow slide, rendered exactly as it will publish: the creator's
// photo (or a placeholder while none exists), the admin's inset picture, and
// the admin-placed text boxes. Box geometry is stored as stage fractions, so
// this scales from a card thumbnail to a full-screen preview and matches the
// server-side bake in renderAdapter.renderSlideImage.
import { useEffect, useState, type JSX } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  MAX_BOX_SIZE,
  MIN_BOX_SIZE,
  OVERLAY_TEXT_SPEC,
  type OverlayBox,
} from '../lib/overlay-boxes';
import { color } from '../theme/tokens';
import { DragPlacement, type PlacementMove } from './creator/DragPlacement';
import { GestureItem } from './creator/slides/GestureItem';
import { TikTokChrome } from './creator/slides/TikTokChrome';
import { OverlayTextBox } from './ui/OverlayTextBox';
import { SkeletonCard } from './ui/Skeleton';

/** Full creator editing: drag, pinch and tap on boxes, drag on the inset. */
export type SlideStageEditing = {
  onMoveBox: (boxId: string, x: number, y: number) => void;
  onScaleBox: (boxId: string, size: number) => void;
  onTapBox: (boxId: string) => void;
  onMoveInset?: PlacementMove;
  /** New inset width as a frame fraction; the stage keeps the aspect. */
  onScaleInset?: (width: number) => void;
  selectedBoxId: string | null;
};

/** Server bounds for the inset width (creator_place_segment). */
const INSET_MIN_WIDTH = 0.15;
const INSET_MAX_WIDTH = 0.95;

/** Defaults when the admin attached a picture but never saved a placement.
 * Mirrors renderTimeline.ts (IMAGE_Y / IMAGE_WIDTH). */
export const SLIDE_INSET_DEFAULTS = { x: 0.5, y: 0.62, width: 0.85 };

export type SlideInset = {
  uri: string;
  x: number | null;
  y: number | null;
  width: number | null;
};

function isVideoUri(uri: string): boolean {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(uri);
}

export function SlideStage(props: {
  boxes: OverlayBox[];
  /** The creator's photo; absent in the admin editor before upload. */
  photoUri?: string;
  inset?: SlideInset;
  /** Shown on the empty background when there is no photo yet. */
  placeholder?: string;
  tint?: string;
  style?: StyleProp<ViewStyle>;
  /** When set, the creator can hold and drag each text box. */
  onMoveBox?: (boxId: string, x: number, y: number) => void;
  /** When set, the creator can hold and drag the inset picture. */
  onMoveInset?: PlacementMove;
  onDragStart?: () => void;
  /** Creator stage editing; replaces the hold and drag handlers above. */
  editing?: SlideStageEditing;
  /** Ghost TikTok UI (action column, caption block) as safe area guides. */
  chrome?: boolean;
}): JSX.Element {
  const {
    boxes,
    photoUri,
    inset,
    placeholder,
    tint,
    style,
    onMoveBox,
    onMoveInset,
    onDragStart,
    editing,
    chrome = false,
  } = props;
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [insetAspect, setInsetAspect] = useState(9 / 16);
  /** Shimmer covers the photo until this uri has decoded. */
  const [loadedUri, setLoadedUri] = useState<string | null>(null);

  const insetUri = inset && !isVideoUri(inset.uri) ? inset.uri : undefined;

  useEffect(() => {
    if (insetUri === undefined) return;
    Image.getSize(
      insetUri,
      (w, h) => {
        if (w > 0 && h > 0) setInsetAspect(w / h);
      },
      () => undefined,
    );
  }, [insetUri]);

  const insetWidthFraction = inset?.width ?? SLIDE_INSET_DEFAULTS.width;
  const insetW = insetWidthFraction * stage.w;
  const insetH = insetW / insetAspect;
  const k = stage.w > 0 ? stage.w / 390 : 1;
  // Widest the inset may grow and still sit inside the frame top to bottom.
  const insetMaxWidth =
    stage.w > 0
      ? Math.min(INSET_MAX_WIDTH, (insetAspect * stage.h) / stage.w)
      : INSET_MAX_WIDTH;

  return (
    <View
      style={[styles.root, { backgroundColor: tint ?? color.ink900 }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setStage({ w: width, h: height });
      }}
    >
      {photoUri !== undefined ? (
        <>
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => setLoadedUri(photoUri)}
          />
          {loadedUri !== photoUri ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <SkeletonCard radius={0} style={styles.shimmer} />
            </View>
          ) : null}
        </>
      ) : placeholder !== undefined && placeholder.length > 0 ? (
        <View style={styles.placeholderWrap} pointerEvents="none">
          <Text style={[styles.placeholderText, { fontSize: Math.max(9, 13 * k) }]}>
            {placeholder}
          </Text>
        </View>
      ) : null}

      {chrome ? <TikTokChrome stageWidth={stage.w} stageHeight={stage.h} /> : null}

      {insetUri !== undefined && stage.w > 0 && editing !== undefined ? (
        <GestureItem
          x={inset?.x ?? SLIDE_INSET_DEFAULTS.x}
          y={inset?.y ?? SLIDE_INSET_DEFAULTS.y}
          stageWidth={stage.w}
          stageHeight={stage.h}
          onMove={editing.onMoveInset}
          onScale={
            editing.onScaleInset
              ? (ratio) => editing.onScaleInset?.(insetWidthFraction * ratio)
              : undefined
          }
          minScale={INSET_MIN_WIDTH / insetWidthFraction}
          maxScale={Math.max(1, insetMaxWidth / insetWidthFraction)}
          onGestureStart={onDragStart}
          style={[
            styles.inset,
            { width: insetW, height: insetH, borderRadius: 10 * k },
          ]}
        >
          <Image
            source={{ uri: insetUri }}
            style={styles.insetImg}
            resizeMode="cover"
          />
        </GestureItem>
      ) : null}
      {insetUri !== undefined && stage.w > 0 && editing === undefined ? (
        <DragPlacement
          x={inset?.x ?? SLIDE_INSET_DEFAULTS.x}
          y={inset?.y ?? SLIDE_INSET_DEFAULTS.y}
          stageWidth={stage.w}
          stageHeight={stage.h}
          onMove={onMoveInset}
          onDragStart={onDragStart}
          style={[
            styles.inset,
            { width: insetW, height: insetH, borderRadius: 10 * k },
          ]}
        >
          <Image
            source={{ uri: insetUri }}
            style={styles.insetImg}
            resizeMode="cover"
          />
        </DragPlacement>
      ) : null}

      {stage.w > 0 && editing !== undefined
        ? boxes.map((box) => {
            const fontSize = Math.max(6, box.size * stage.w);
            return (
              <GestureItem
                key={box.id}
                x={box.x}
                y={box.y}
                stageWidth={stage.w}
                stageHeight={stage.h}
                onMove={(nx, ny) => editing.onMoveBox(box.id, nx, ny)}
                onScale={(ratio) => editing.onScaleBox(box.id, box.size * ratio)}
                minScale={MIN_BOX_SIZE / box.size}
                maxScale={MAX_BOX_SIZE / box.size}
                onTap={() => editing.onTapBox(box.id)}
                onGestureStart={onDragStart}
                selected={editing.selectedBoxId === box.id}
              >
                <OverlayTextBox
                  text={box.text}
                  color={box.color}
                  bg={box.bg}
                  fontSize={fontSize}
                  maxWidth={OVERLAY_TEXT_SPEC.maxWidth * stage.w}
                />
              </GestureItem>
            );
          })
        : null}

      {stage.w > 0 && editing === undefined
        ? boxes.map((box) => {
            const fontSize = Math.max(6, box.size * stage.w);
            return (
              <DragPlacement
                key={box.id}
                x={box.x}
                y={box.y}
                stageWidth={stage.w}
                stageHeight={stage.h}
                onMove={
                  onMoveBox
                    ? (nx, ny) => onMoveBox(box.id, nx, ny)
                    : undefined
                }
                onDragStart={onDragStart}
              >
                <OverlayTextBox
                  text={box.text}
                  color={box.color}
                  bg={box.bg}
                  fontSize={fontSize}
                  maxWidth={OVERLAY_TEXT_SPEC.maxWidth * stage.w}
                />
              </DragPlacement>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  placeholderWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: '8%',
  },
  placeholderText: {
    color: color.whiteA45,
    fontWeight: '700',
    textAlign: 'center',
  },
  inset: {
    overflow: 'hidden',
    backgroundColor: color.ink800,
  },
  shimmer: {
    flex: 1,
    opacity: 0.35,
  },
  insetImg: {
    width: '100%',
    height: '100%',
  },
});
