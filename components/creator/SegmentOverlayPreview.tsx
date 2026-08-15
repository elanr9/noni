// Live preview of a segment's final edit while the creator records. Mirrors
// the render pass in supabase/functions/_shared/renderAdapter.ts: every
// admin-placed text box (TikTok Sans, per-box color and position) and the
// screenshot card at its admin-placed spot. Green screen segments skip
// the card here because the screenshot fills the stage as the background.
import type { JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  TikTokSans_700Bold,
  useFonts,
} from '@expo-google-fonts/tiktok-sans';

import type { BriefSegment, TextOverlay } from '../../lib/briefs-api';
import {
  overlayBoxFill,
  overlayTextContrast,
  parseOverlayBoxes,
} from '../../lib/overlay-boxes';

const IMAGE_Y = 0.62;
const IMAGE_WIDTH = 0.85;

export type ShotPreview = { url: string; aspect: number };

export function SegmentOverlayPreview(props: {
  segment: BriefSegment;
  shot: ShotPreview | null;
  stageWidth: number;
  stageHeight: number;
  overlay: TextOverlay;
}): JSX.Element | null {
  const { segment, shot, stageWidth, stageHeight, overlay } = props;
  const [fontLoaded] = useFonts({ TikTokSans_700Bold });

  const showText = overlay.enabled && segment.show_on_screen;
  const boxes = showText
    ? parseOverlayBoxes(segment.overlay_style, {
        text: segment.overlay_text,
        textY: segment.text_y,
      })
    : [];
  const showCard = shot !== null && segment.layout !== 'green_screen';
  if (boxes.length === 0 && !showCard) return null;

  const cardWidth = stageWidth * (segment.screenshot_width ?? IMAGE_WIDTH);
  const cardHeight = showCard ? cardWidth / (shot?.aspect ?? 9 / 16) : 0;
  const cardLeft = stageWidth * (segment.screenshot_x ?? 0.5) - cardWidth / 2;
  const cardTop = stageHeight * (segment.screenshot_y ?? IMAGE_Y) - cardHeight / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {showCard && shot !== null ? (
        <Image
          source={{ uri: shot.url }}
          style={[
            styles.card,
            { left: cardLeft, top: cardTop, width: cardWidth, height: cardHeight },
          ]}
        />
      ) : null}
      {boxes.map((box) => {
        const font = stageWidth * box.size;
        const text = box.text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('\n');
        if (text.length === 0) return null;
        const decoration = box.bg
          ? {
              color: overlayTextContrast(box.color),
              backgroundColor: overlayBoxFill(box.color),
              paddingHorizontal: font * 0.72,
              paddingVertical: font * 0.48,
              borderRadius: font * 0.72,
              overflow: 'hidden' as const,
            }
          : {
              color: box.color,
              textShadowColor: 'rgba(0, 0, 0, 0.6)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            };
        return (
          <View
            key={box.id}
            style={[
              styles.textWrap,
              {
                transform: [
                  { translateX: (box.x - 0.5) * stageWidth },
                  { translateY: (box.y - 0.5) * stageHeight },
                ],
              },
            ]}
          >
            <Text
              style={[
                styles.text,
                {
                  fontSize: font,
                  lineHeight: font * 1.3,
                  fontFamily: fontLoaded ? 'TikTokSans_700Bold' : undefined,
                },
                decoration,
              ]}
            >
              {text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderRadius: 12,
    resizeMode: 'cover',
  },
  textWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  text: {
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    maxWidth: '100%',
  },
});
