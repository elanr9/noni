import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { formatHandle } from '../../lib/social-accounts';
import {
  borderWidth,
  color,
  motion,
  radius,
  shadow,
  space,
  type,
} from '../../theme/tokens';

const CONFETTI_TINTS = [color.blue500, color.green, color.amber, color.blue300];

/**
 * Fixed rather than random so the burst reads the same every time and never
 * reshuffles between renders. Values are percentages of the card width.
 */
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  left: 4 + i * 6.8,
  delay: (i % 5) * 70,
  drift: i % 2 === 0 ? 24 : -20,
  spin: i % 2 === 0 ? 1 : -1,
  size: 6 + (i % 3) * 2,
  tint: CONFETTI_TINTS[i % CONFETTI_TINTS.length] as string,
}));

function ConfettiPiece({
  piece,
  progress,
}: {
  piece: (typeof CONFETTI)[number];
  progress: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        styles.confetti,
        {
          left: `${piece.left}%`,
          width: piece.size,
          height: piece.size * 1.8,
          backgroundColor: piece.tint,
          opacity: progress.interpolate({
            inputRange: [0, 0.15, 0.75, 1],
            outputRange: [0, 1, 1, 0],
          }),
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 190],
              }),
            },
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, piece.drift],
              }),
            },
            {
              rotate: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', `${piece.spin * 420}deg`],
              }),
            },
          ],
        },
      ]}
    />
  );
}

function LinkedRow({
  icon,
  label,
  handle,
}: {
  icon: IconName;
  label: string;
  handle: string | null;
}) {
  return (
    <View style={styles.linkedRow}>
      <View style={styles.linkedIcon}>
        <Icon name={icon} size={17} color={color.blue700} />
      </View>
      <View style={styles.linkedText}>
        <Text style={styles.linkedLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.linkedHandle}>
          {handle !== null ? formatHandle(handle) : 'Linked'}
        </Text>
      </View>
      <Icon name="circle-check-big" size={19} color={color.green} />
    </View>
  );
}

export interface ConnectedCelebrationProps {
  visible: boolean;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  onDone: () => void;
}

/** Shown once, the moment both socials finish linking through Upload-Post. */
export function ConnectedCelebration({
  visible,
  instagramHandle,
  tiktokHandle,
  onDone,
}: ConnectedCelebrationProps) {
  const enter = useRef(new Animated.Value(0)).current;
  const seal = useRef(new Animated.Value(0)).current;
  const fall = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    enter.setValue(0);
    seal.setValue(0);
    fall.setValue(0);
    Animated.sequence([
      Animated.timing(enter, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(seal, {
          toValue: 1,
          duration: motion.base,
          easing: motion.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(fall, {
          toValue: 1,
          duration: 1800,
          easing: motion.easeOut,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [visible, enter, seal, fall]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.scrim}>
        <Animated.View
          style={[
            styles.card,
            shadow.shadowRaised,
            {
              opacity: enter,
              transform: [
                {
                  translateY: enter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
                {
                  scale: enter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View pointerEvents="none" style={styles.confettiLayer}>
            {CONFETTI.map((piece) => (
              <ConfettiPiece key={piece.left} piece={piece} progress={fall} />
            ))}
          </View>

          <View style={styles.sealWrap}>
            <Animated.View
              style={[
                styles.sealRing,
                {
                  opacity: seal.interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0, 0.5, 0],
                  }),
                  transform: [
                    {
                      scale: seal.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.7, 1.5],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.seal,
                {
                  transform: [
                    {
                      scale: seal.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.4, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Icon name="check" size={34} color={color.white} strokeWidth={3} />
            </Animated.View>
          </View>

          <Text style={styles.title}>Your accounts are connected</Text>
          <Text style={styles.body}>
            Instagram and TikTok are linked. Once a post is approved it goes out
            for you, no tapping required.
          </Text>

          <View style={styles.linkedCard}>
            <LinkedRow icon="at-sign" label="Instagram" handle={instagramHandle} />
            <View style={styles.linkedDivider} />
            <LinkedRow icon="music-2" label="TikTok" handle={tiktokHandle} />
          </View>

          <View style={styles.cta}>
            <Button size="lg" block onPress={onDone}>
              Nice, keep going
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: color.sheetScrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.gutter,
  },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: color.white,
    borderRadius: radius['2xl'],
    paddingTop: 30,
    paddingHorizontal: 22,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  confetti: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
  },
  sealWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
  },
  seal: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: space[5],
    fontSize: 25,
    lineHeight: 25 * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.bold,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    marginTop: space[2],
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: type.weight.regular,
    color: color.slate500,
    textAlign: 'center',
  },
  linkedCard: {
    alignSelf: 'stretch',
    marginTop: space[6],
    backgroundColor: color.offWhite,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  linkedDivider: {
    height: borderWidth.hair,
    backgroundColor: color.line,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  linkedIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  linkedLabel: {
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  linkedHandle: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  cta: {
    alignSelf: 'stretch',
    marginTop: space[6],
  },
});
