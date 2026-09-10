import { useEffect, useState, type JSX } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { SkeletonCard, SkeletonLine } from '../ui/Skeleton';

export interface AiWorkingCardProps {
  /** "Making your reel", "Writing this post" */
  title: string;
  /** "From “the one note editors leave…”" */
  subtitle?: string;
  /** Status lines shown one at a time, crossfading every stepMs, holding on the last. */
  steps: readonly string[];
  stepMs?: number;
  /** Ghost shape: video = hook line + 3 clip lines; photo_carousel = row of 4 slide tiles. */
  family: 'video' | 'photo_carousel';
  /** Batch progress, renders "2 of 3" quietly at top right. */
  progress?: { done: number; total: number };
  style?: StyleProp<ViewStyle>;
}

export const VIDEO_FILL_STEPS: readonly string[] = [
  'Reading your idea',
  'Writing the hook',
  'Shaping the clips',
  'Writing the caption',
  'Placing pictures',
  'Almost there',
];

export const SLIDESHOW_FILL_STEPS: readonly string[] = [
  'Reading your idea',
  'Writing slide one',
  'Laying out the slides',
  'Writing the caption',
  'Placing pictures',
  'Almost there',
];

const BREATH_MS = 1800;
const FADE_OUT_MS = 220;
const FADE_IN_MS = 260;
const DEFAULT_STEP_MS = 2200;

function useBreathing() {
  const [breath] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  return { scale, opacity };
}

function useCrossfadingStep(steps: readonly string[], stepMs: number) {
  const [shown, setShown] = useState<{ steps: readonly string[]; index: number }>({
    steps,
    index: 0,
  });
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (steps.length <= 1) return;

    let next = 0;
    let fadeIn: Animated.CompositeAnimation | null = null;
    let fadeOut: Animated.CompositeAnimation | null = null;

    const timer = setInterval(() => {
      if (next >= steps.length - 1) {
        clearInterval(timer);
        return;
      }
      fadeOut = Animated.timing(fade, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      });
      fadeOut.start(({ finished }) => {
        if (!finished) return;
        next += 1;
        setShown({ steps, index: next });
        fadeIn = Animated.timing(fade, {
          toValue: 1,
          duration: FADE_IN_MS,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        });
        fadeIn.start();
      });
    }, stepMs);

    return () => {
      clearInterval(timer);
      fadeOut?.stop();
      fadeIn?.stop();
      fade.setValue(1);
    };
  }, [steps, stepMs, fade]);

  // A new steps list starts over on the first line without an effect.
  const index = shown.steps === steps ? shown.index : 0;
  return { text: steps[Math.min(index, steps.length - 1)] ?? '', opacity: fade };
}

function Glyph({
  scale,
  opacity,
}: {
  scale: Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Animated.View style={[styles.glyph, { opacity, transform: [{ scale }] }]}>
      <Icon name="sparkles" size={22} color={color.blue700} />
    </Animated.View>
  );
}

function ProgressLabel({ done, total }: { done: number; total: number }) {
  return <Text style={styles.progress}>{`${done} of ${total}`}</Text>;
}

function StatusLine({
  text,
  textOpacity,
  dotOpacity,
}: {
  text: string;
  textOpacity: Animated.Value;
  dotOpacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={styles.statusRow}>
      <Animated.View style={[styles.dot, { opacity: dotOpacity }]} />
      <Animated.Text style={[styles.statusText, { opacity: textOpacity }]} numberOfLines={1}>
        {text}
      </Animated.Text>
    </View>
  );
}

function VideoGhost() {
  return (
    <View style={styles.ghost}>
      <SkeletonLine height={14} width="70%" />
      <SkeletonLine height={12} width="90%" />
      {(['85%', '60%', '75%'] as const).map((width) => (
        <View key={width} style={styles.clipRow}>
          <SkeletonCard radius={8} style={styles.clipThumb} />
          <SkeletonLine height={10} width={width} />
        </View>
      ))}
    </View>
  );
}

function CarouselGhost() {
  return (
    <View style={styles.ghost}>
      <SkeletonLine height={14} width="60%" />
      <View style={styles.slideRow}>
        {[0, 1, 2, 3].map((slide) => (
          <SkeletonCard key={slide} radius={10} style={styles.slideTile} />
        ))}
      </View>
      <SkeletonLine height={10} width="50%" />
    </View>
  );
}

export function AiWorkingCard({
  title,
  subtitle,
  steps,
  stepMs = DEFAULT_STEP_MS,
  family,
  progress,
  style,
}: AiWorkingCardProps): JSX.Element {
  const breath = useBreathing();
  const step = useCrossfadingStep(steps, stepMs);

  return (
    <View
      style={[styles.card, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}. ${step.text}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.header}>
        <Glyph scale={breath.scale} opacity={breath.opacity} />
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {progress ? <ProgressLabel done={progress.done} total={progress.total} /> : null}
      </View>

      <StatusLine text={step.text} textOpacity={step.opacity} dotOpacity={breath.opacity} />

      {family === 'video' ? <VideoGhost /> : <CarouselGhost />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.xl,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 16,
    gap: 14,
    ...shadow.shadowCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    gap: 2,
    paddingTop: 2,
  },
  title: {
    fontSize: type.size.card,
    fontWeight: '800',
    color: color.ink,
  },
  subtitle: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate500,
  },
  progress: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate400,
    paddingTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  statusText: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.blue700,
  },
  ghost: {
    opacity: 0.9,
    gap: 10,
  },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clipThumb: {
    width: 28,
    height: 28,
  },
  slideRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slideTile: {
    width: 56,
    height: 74,
  },
});
