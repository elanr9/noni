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
}): JSX.Element {
  const { boxes, photoUri, inset, placeholder, tint, style } = props;
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
        <View
          pointerEvents="none"
          style={[
            styles.inset,
            {
              left: (inset?.x ?? SLIDE_INSET_DEFAULTS.x) * stage.w - insetW / 2,
              top: (inset?.y ?? SLIDE_INSET_DEFAULTS.y) * stage.h - insetH / 2,
              width: insetW,
              height: insetH,
              borderRadius: 10 * k,
            },
          ]}
        >
          <Image
            source={{ uri: insetUri }}
            style={styles.insetImg}
            resizeMode="cover"
          />
        </View>
      ) : null}

      {stage.w > 0
        ? boxes.map((box) => {
            const fontSize = Math.max(6, box.size * stage.w);
            return (
              <View
                key={box.id}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.boxLayer]}
              >
              <View
                style={[
                  styles.boxWrap,
                  {
                    transform: [
                      { translateX: (box.x - 0.5) * stage.w },
                      { translateY: (box.y - 0.5) * stage.h },
                    ],
                  },
                ]}
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
                  <Text
                    style={[
                      styles.boxText,
                      {
                        color: box.bg ? overlayTextContrast(box.color) : box.color,
                        fontSize,
                        lineHeight: fontSize * 1.22,
                        textShadowColor: box.bg
                          ? 'transparent'
                          : 'rgba(0,0,0,0.6)',
                        textShadowOffset: box.bg
                          ? { width: 0, height: 0 }
                          : { width: 0, height: 1 },
                        textShadowRadius: box.bg ? 0 : 10,
                      },
                    ]}
                  >
                    {box.text}
                  </Text>
                </View>
              </View>
              </View>
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
    ...StyleSheet.absoluteFillObject,
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
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: color.ink800,
  },
  insetImg: {
    width: '100%',
    height: '100%',
  },
  boxLayer: {
    alignItems: 'center',
    justifyContent: 'center',
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
