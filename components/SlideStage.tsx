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
  overlayBoxFill,
  overlayTextContrast,
  type OverlayBox,
} from '../lib/overlay-boxes';
import { color } from '../theme/tokens';
import { DragPlacement, type PlacementMove } from './creator/DragPlacement';
import { OutlinedText } from './ui/OutlinedText';

const OVERLAY_FONT = 'TikTokSans_700Bold';
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
  } = props;
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [insetAspect, setInsetAspect] = useState(9 / 16);

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

  const insetW = (inset?.width ?? SLIDE_INSET_DEFAULTS.width) * stage.w;
  const insetH = insetW / insetAspect;
  // Pill chrome scales with the stage so a card thumbnail looks like the
  // full-screen composer, not a giant bubble on a tiny slide.
  const k = stage.w > 0 ? stage.w / 390 : 1;

  return (
    <View
      style={[styles.root, { backgroundColor: tint ?? color.ink900 }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setStage({ w: width, h: height });
      }}
    >
      {photoUri !== undefined ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : placeholder !== undefined && placeholder.length > 0 ? (
        <View style={styles.placeholderWrap} pointerEvents="none">
          <Text style={[styles.placeholderText, { fontSize: Math.max(9, 13 * k) }]}>
            {placeholder}
          </Text>
        </View>
      ) : null}

      {insetUri !== undefined && stage.w > 0 ? (
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

      {stage.w > 0
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
                style={styles.boxWrap}
              >
                <View
                  style={[
                    styles.pill,
                    {
                      paddingVertical: 12 * k,
                      paddingHorizontal: 18 * k,
                      borderRadius: 16 * k,
                    },
                    box.bg
                      ? { backgroundColor: overlayBoxFill(box.color) }
                      : styles.pillClear,
                  ]}
                >
                  {box.bg ? (
                    <Text
                      style={[
                        styles.boxText,
                        {
                          color: overlayTextContrast(box.color),
                          fontSize,
                          lineHeight: fontSize * 1.22,
                        },
                      ]}
                    >
                      {box.text}
                    </Text>
                  ) : (
                    <OutlinedText
                      text={box.text}
                      fontSize={fontSize}
                      color={box.color}
                      style={[styles.boxText, { lineHeight: fontSize * 1.22 }]}
                    />
                  )}
                </View>
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
  insetImg: {
    width: '100%',
    height: '100%',
  },
  boxWrap: {
    maxWidth: '86%',
  },
  pill: {
    maxWidth: '100%',
    justifyContent: 'center',
  },
  pillClear: {
    backgroundColor: 'transparent',
  },
  boxText: {
    fontFamily: OVERLAY_FONT,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
});
