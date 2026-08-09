// Screenshot and text placement. A 9:16 camera-style canvas stands in for
// the creator's recording; the admin drags the screenshot (and the text
// bubble, when the segment has on-screen text) to where they should sit on
// the finished video, and sizes the screenshot with the slider. Coordinates
// are normalized 0-1 center + width fraction, the same shape the render
// timeline uses, so what is saved here is exactly what the render places.
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  TikTokSans_700Bold,
  useFonts,
} from '@expo-google-fonts/tiktok-sans';

import type { TextOverlay } from '../../../lib/briefs-api';
import { color, radiusAdmin } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Sheet } from '../shared';

/** Render defaults, mirrored from renderTimeline.ts. */
const DEFAULT_X = 0.5;
const DEFAULT_Y = 0.62;
const DEFAULT_WIDTH = 0.85;
const DEFAULT_TEXT_Y = 0.45;
const MIN_WIDTH = 0.3;
const MAX_WIDTH = 1;

export interface PlacementSheetProps {
  visible: boolean;
  /** Signed URL of the screenshot being placed. */
  imageUrl: string | null;
  /** The segment's on-screen text; null hides the draggable bubble. */
  overlayText: string | null;
  textOverlay: TextOverlay;
  initialX: number | null;
  initialY: number | null;
  initialWidth: number | null;
  initialTextY: number | null;
  saving: boolean;
  onClose: () => void;
  onSave: (pos: {
    x: number;
    y: number;
    width: number;
    textY: number | null;
  }) => void;
}

export function PlacementSheet({
  visible,
  imageUrl,
  overlayText,
  textOverlay,
  initialX,
  initialY,
  initialWidth,
  initialTextY,
  saving,
  onClose,
  onSave,
}: PlacementSheetProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [fontLoaded] = useFonts({ TikTokSans_700Bold });

  const [pos, setPos] = useState({ x: DEFAULT_X, y: DEFAULT_Y });
  const [shotWidth, setShotWidth] = useState(DEFAULT_WIDTH);
  const [textY, setTextY] = useState(DEFAULT_TEXT_Y);
  /** Screenshot width / height, measured once the URL is known. */
  const [aspect, setAspect] = useState(0.75);

  // Refs mirror state so the PanResponders, created once, read live values.
  const posRef = useRef(pos);
  posRef.current = pos;
  const textYRef = useRef(textY);
  textYRef.current = textY;
  const dragStartRef = useRef({ x: 0, y: 0 });
  const textDragStartRef = useRef(0);
  const canvasRef = useRef({ w: 1, h: 1 });
  const trackWidthRef = useRef(1);

  useEffect(() => {
    if (!visible) return;
    setPos({ x: initialX ?? DEFAULT_X, y: initialY ?? DEFAULT_Y });
    setShotWidth(initialWidth ?? DEFAULT_WIDTH);
    setTextY(initialTextY ?? DEFAULT_TEXT_Y);
  }, [visible, initialX, initialY, initialWidth, initialTextY]);

  useEffect(() => {
    if (!imageUrl) return;
    Image.getSize(
      imageUrl,
      (w, h) => {
        if (w > 0 && h > 0) setAspect(w / h);
      },
      () => undefined,
    );
  }, [imageUrl]);

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = posRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const { w, h } = canvasRef.current;
        setPos({
          x: clamp01(dragStartRef.current.x + gesture.dx / w),
          y: clamp01(dragStartRef.current.y + gesture.dy / h),
        });
      },
    }),
  ).current;

  const textResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        textDragStartRef.current = textYRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const { h } = canvasRef.current;
        setTextY(clamp01(textDragStartRef.current + gesture.dy / h));
      },
    }),
  ).current;

  const sliderResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setShotWidth(widthFromTrackX(evt.nativeEvent.locationX, trackWidthRef.current));
      },
      onPanResponderMove: (evt) => {
        setShotWidth(widthFromTrackX(evt.nativeEvent.locationX, trackWidthRef.current));
      },
    }),
  ).current;

  // Canvas fills the sheet width at 9:16; the sheet body scrolls if short screens need it.
  const canvasW = Math.min(screenWidth - 48, 262);
  const canvasH = (canvasW * 16) / 9;
  canvasRef.current = { w: canvasW, h: canvasH };

  const imgW = shotWidth * canvasW;
  const imgH = imgW / aspect;
  const thumbLeft =
    ((shotWidth - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)) * 100;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          size="lg"
          variant="primary"
          block
          disabled={saving || (!imageUrl && !overlayText)}
          onPress={() =>
            onSave({
              x: pos.x,
              y: pos.y,
              width: shotWidth,
              textY: overlayText ? textY : null,
            })
          }
        >
          {saving ? 'Saving…' : 'Save placement'}
        </Button>
      }
    >
      <Text style={styles.title}>
        {imageUrl ? 'Place screenshot' : 'Place text'}
      </Text>
      <Text style={styles.subtitle}>
        {overlayText && imageUrl
          ? 'Drag the screenshot and the text to where they should sit on the finished video.'
          : overlayText
            ? 'Drag the text to where it should sit on the finished video.'
            : 'Drag it to where it should sit on the finished video.'}{' '}
        The frame below stands in for the creator's camera.
      </Text>

      <View style={styles.canvasWrap}>
        <View style={[styles.canvas, { width: canvasW, height: canvasH }]}>
          <View style={[styles.gridLineV, { left: canvasW / 3 }]} />
          <View style={[styles.gridLineV, { left: (canvasW * 2) / 3 }]} />
          <View style={[styles.gridLineH, { top: canvasH / 3 }]} />
          <View style={[styles.gridLineH, { top: (canvasH * 2) / 3 }]} />
          <View style={styles.shutterRing} />

          {imageUrl ? (
            <View
              {...dragResponder.panHandlers}
              style={[
                styles.shot,
                {
                  width: imgW,
                  height: imgH,
                  left: pos.x * canvasW - imgW / 2,
                  top: pos.y * canvasH - imgH / 2,
                },
              ]}
            >
              <Image source={{ uri: imageUrl }} style={styles.shotImage} />
            </View>
          ) : null}

          {overlayText ? (
            <View
              {...textResponder.panHandlers}
              style={[styles.textRow, { top: textY * canvasH }]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  {
                    fontSize: canvasW * 0.044,
                    lineHeight: canvasW * 0.058,
                    fontFamily: fontLoaded ? 'TikTokSans_700Bold' : undefined,
                  },
                  textOverlay.mode === 'box'
                    ? {
                        color: textOverlay.text_color,
                        backgroundColor: textOverlay.accent_color,
                        paddingHorizontal: canvasW * 0.022,
                        paddingVertical: canvasW * 0.014,
                        borderRadius: canvasW * 0.02,
                        overflow: 'hidden',
                      }
                    : textOverlay.mode === 'outline'
                      ? {
                          color: textOverlay.text_color,
                          textShadowColor: textOverlay.accent_color,
                          textShadowOffset: { width: 0, height: 0 },
                          textShadowRadius: 2,
                        }
                      : {
                          color: textOverlay.text_color,
                          textShadowColor: 'rgba(0,0,0,0.6)',
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 3,
                        },
                ]}
              >
                {overlayText}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {imageUrl ? (
        <>
          <Text style={styles.sizeLabel}>Size</Text>
          <View
            {...sliderResponder.panHandlers}
            style={styles.track}
            onLayout={(e) => {
              trackWidthRef.current = e.nativeEvent.layout.width;
            }}
          >
            <View style={styles.trackLine} />
            <View style={[styles.trackFill, { width: `${thumbLeft}%` }]} />
            <View style={[styles.thumb, { left: `${thumbLeft}%` }]} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function widthFromTrackX(x: number, trackWidth: number): number {
  const t = Math.min(1, Math.max(0, x / trackWidth));
  return MIN_WIDTH + t * (MAX_WIDTH - MIN_WIDTH);
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate400,
  },
  canvasWrap: {
    alignItems: 'center',
  },
  canvas: {
    borderRadius: radiusAdmin.lg,
    backgroundColor: '#16181d',
    overflow: 'hidden',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  shutterRing: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  shot: {
    position: 'absolute',
    borderRadius: radiusAdmin.sm,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  shotImage: {
    width: '100%',
    height: '100%',
  },
  // Full-width hit row so the small bubble is easy to grab; the transform
  // centers the row's content on the normalized textY like the render.
  textRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    alignItems: 'center',
    transform: [{ translateY: '-50%' }],
  },
  bubbleText: {
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: '92%',
  },
  sizeLabel: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
  },
  track: {
    height: 32,
    justifyContent: 'center',
  },
  trackLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.fillQuiet,
  },
  trackFill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: color.blue500,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.blue500,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
