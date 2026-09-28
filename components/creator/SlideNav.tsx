import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { OverlayBox } from '../../lib/overlay-boxes';
import { color, motion, radius, shadow, type } from '../../theme/tokens';
import { SlideStage, type SlideInset, type SlideStageEditing } from '../SlideStage';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

/**
 * The slideshow scroller used everywhere a post is viewed (SCREENS §8):
 * 34px round arrows only within bounds, tappable dots bottom-center
 * (active 16x6), per-slide background tint crossfading 240ms, optional
 * per-slide text. Fills its parent; give the container a height.
 */

export interface SlideNavSlide {
  /** Overlay text, centered on the slide (legacy, when no boxes exist). */
  text?: string;
  /** Image uri, rendered cover over the tint. */
  image?: string;
  /** Background tint; defaults cycle through a variant palette. */
  tint?: string;
  /** Admin-placed text boxes; when present they replace the centered text. */
  boxes?: OverlayBox[];
  /** The admin's inset picture on this slide. */
  inset?: SlideInset;
}

export interface SlideNavProps {
  slides: SlideNavSlide[];
  variant?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
  /** When set, the creator can hold and drag text boxes on the current slide. */
  onMoveBox?: (slideIndex: number, boxId: string, x: number, y: number) => void;
  /** When set, the creator can hold and drag the inset on the current slide. */
  onMoveInset?: (slideIndex: number, x: number, y: number) => void;
  /** Fires when the creator pages to another slide. */
  onIndexChange?: (slideIndex: number) => void;
  /** Full stage editing on the current slide; every slide renders on the stage. */
  editing?: SlideNavEditing;
  /** Ghost TikTok UI on every slide as safe area guides. */
  chrome?: boolean;
  /** Horizontal swipes on the slide page it. */
  swipe?: boolean;
}

export interface SlideNavEditing {
  onMoveBox: (slideIndex: number, boxId: string, x: number, y: number) => void;
  onScaleBox: (slideIndex: number, boxId: string, size: number) => void;
  onTapBox: (slideIndex: number, boxId: string) => void;
  onMoveInset: (slideIndex: number, x: number, y: number) => void;
  /** New inset width as a fraction of the frame width. */
  onScaleInset?: (slideIndex: number, width: number) => void;
  selectedBoxId: string | null;
}

const SWIPE_MIN_DX = 48;

/**
 * Horizontal swipe pager whose targets are refreshed after each render.
 * Bubble phase only (no capture): a box or the inset that claimed the touch
 * on start keeps it, so the pager only ever sees swipes on the bare photo.
 */
function createSwipeGesture() {
  let page = { go: (_next: number) => undefined as void, index: 0, enabled: false };
  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gs) =>
      page.enabled &&
      gs.numberActiveTouches === 1 &&
      Math.abs(gs.dx) > 8 &&
      Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_evt, gs) => {
      if (Math.abs(gs.dx) < SWIPE_MIN_DX) return;
      page.go(page.index + (gs.dx < 0 ? 1 : -1));
    },
  });
  return {
    panHandlers: responder.panHandlers,
    setPage(go: (next: number) => void, index: number, enabled: boolean) {
      page = { go, index, enabled };
    },
  };
}

const DARK_TINTS = ['#16324A', '#242C3B', '#2E2838', '#1E3A30'];
const LIGHT_TINTS = [color.blue100, '#ECE7FB', color.amberSoft, color.greenSoft];

function tintFor(slide: SlideNavSlide, index: number, dark: boolean): string {
  if (slide.tint !== undefined) return slide.tint;
  const palette = dark ? DARK_TINTS : LIGHT_TINTS;
  return palette[index % palette.length];
}

function SlideLayer({
  slide,
  tint,
  dark,
  onMoveBox,
  onMoveInset,
  editing,
  chrome,
}: {
  slide: SlideNavSlide;
  tint: string;
  dark: boolean;
  onMoveBox?: (boxId: string, x: number, y: number) => void;
  onMoveInset?: (x: number, y: number) => void;
  editing?: SlideStageEditing;
  chrome?: boolean;
}) {
  // Slides with admin-placed boxes render exactly as they will publish.
  if (
    (slide.boxes?.length ?? 0) > 0 ||
    slide.inset !== undefined ||
    editing !== undefined ||
    chrome === true
  ) {
    return (
      <SlideStage
        boxes={slide.boxes ?? []}
        photoUri={slide.image}
        inset={slide.inset}
        tint={tint}
        style={StyleSheet.absoluteFill}
        onMoveBox={onMoveBox}
        onMoveInset={onMoveInset}
        editing={editing}
        chrome={chrome}
      />
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]}>
      {slide.image !== undefined && (
        <Image
          source={{ uri: slide.image }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      {slide.text !== undefined && (
        <View style={styles.textWrap} pointerEvents="none">
          <Text style={[styles.slideText, dark ? styles.slideTextDark : styles.slideTextLight]}>
            {slide.text}
          </Text>
        </View>
      )}
    </View>
  );
}

export function SlideNav({
  slides,
  variant = 'dark',
  style,
  onMoveBox,
  onMoveInset,
  onIndexChange,
  editing,
  chrome = false,
  swipe = false,
}: SlideNavProps) {
  const dark = variant === 'dark';
  const [index, setIndex] = useState(0);
  const prevIndexRef = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;

  const count = slides.length;
  const safeIndex = Math.min(index, Math.max(count - 1, 0));
  const prevIndex = Math.min(prevIndexRef.current, Math.max(count - 1, 0));

  const go = (next: number) => {
    if (next === safeIndex || next < 0 || next >= count) return;
    prevIndexRef.current = safeIndex;
    setIndex(next);
    onIndexChange?.(next);
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  };

  // Boxes and the inset claim touches on start, so this only sees swipes on
  // the bare photo.
  const [swipeGesture] = useState(() => createSwipeGesture());
  useEffect(() => {
    swipeGesture.setPage(go, safeIndex, swipe);
  });

  if (count === 0) return <View style={[styles.root, style]} />;

  const current = slides[safeIndex];
  const previous = slides[prevIndex];
  const stageEditing: SlideStageEditing | undefined = editing
    ? {
        onMoveBox: (boxId, x, y) => editing.onMoveBox(safeIndex, boxId, x, y),
        onScaleBox: (boxId, size) => editing.onScaleBox(safeIndex, boxId, size),
        onTapBox: (boxId) => editing.onTapBox(safeIndex, boxId),
        onMoveInset: (x, y) => editing.onMoveInset(safeIndex, x, y),
        onScaleInset: editing.onScaleInset
          ? (width) => editing.onScaleInset?.(safeIndex, width)
          : undefined,
        selectedBoxId: editing.selectedBoxId,
      }
    : undefined;

  return (
    <View style={[styles.root, style]} {...(swipe ? swipeGesture.panHandlers : {})}>
      {prevIndex !== safeIndex && (
        <SlideLayer
          slide={previous}
          tint={tintFor(previous, prevIndex, dark)}
          dark={dark}
          chrome={chrome}
        />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <SlideLayer
          slide={current}
          tint={tintFor(current, safeIndex, dark)}
          dark={dark}
          onMoveBox={
            onMoveBox
              ? (boxId, x, y) => onMoveBox(safeIndex, boxId, x, y)
              : undefined
          }
          onMoveInset={
            onMoveInset ? (x, y) => onMoveInset(safeIndex, x, y) : undefined
          }
          editing={stageEditing}
          chrome={chrome}
        />
      </Animated.View>

      {safeIndex > 0 && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Previous slide"
          onPress={() => go(safeIndex - 1)}
          style={[
            styles.arrow,
            styles.arrowLeft,
            dark ? styles.arrowDark : [styles.arrowLight, shadow.shadowCard],
          ]}
        >
          <Icon name="chevron-left" size={19} color={dark ? color.white : color.ink} />
        </PressableScale>
      )}
      {safeIndex < count - 1 && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Next slide"
          onPress={() => go(safeIndex + 1)}
          style={[
            styles.arrow,
            styles.arrowRight,
            dark ? styles.arrowDark : [styles.arrowLight, shadow.shadowCard],
          ]}
        >
          <Icon name="chevron-right" size={19} color={dark ? color.white : color.ink} />
        </PressableScale>
      )}

      <View style={styles.dots} pointerEvents="box-none">
        {slides.map((_, i) => {
          const active = i === safeIndex;
          return (
            <PressableScale
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Slide ${i + 1} of ${count}`}
              hitSlop={8}
              onPress={() => go(i)}
              style={[
                styles.dot,
                active && styles.dotActive,
                {
                  backgroundColor: active
                    ? dark
                      ? color.white
                      : color.accent
                    : dark
                      ? color.whiteA45
                      : color.slate300,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  textWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  slideText: {
    fontSize: type.size.cardLg,
    fontWeight: type.weight.bold,
    lineHeight: type.size.cardLg * type.leading.snug,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  slideTextDark: {
    color: color.white,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  slideTextLight: {
    color: color.ink,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -17,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 10,
  },
  arrowRight: {
    right: 10,
  },
  arrowDark: {
    backgroundColor: color.whiteA16,
  },
  arrowLight: {
    backgroundColor: color.white,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  dotActive: {
    width: 16,
    borderRadius: 3,
  },
});
