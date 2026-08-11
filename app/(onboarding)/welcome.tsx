import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { PressableScale } from '../../components/ui/PressableScale';
import { Wordmark } from '../../components/ui/Wordmark';
import { color, radius, space, type } from '../../theme/tokens';

const MARLIN = require('../../assets/noni-marlin.png');

/** Design mark is 132px; Wave 1 tokens have no logo-mark size. */
const LOGO_MARK = 132;
const ORBIT_COUNT = 6;
const ORBIT_RADIUS = 92;
const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
const BLOOM_SIZE = Math.sqrt(WIN_W * WIN_W + WIN_H * WIN_H) * 1.15;

export default function WelcomeScreen() {
  const [introDone, setIntroDone] = useState(false);

  const spin = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.55)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentRise = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const orbitLoop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const ringLoop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    spinLoop.start();
    orbitLoop.start();
    ringLoop.start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.spring(markScale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(850),
      Animated.parallel([
        Animated.timing(bloom, {
          toValue: 1,
          duration: 780,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(markScale, {
          toValue: 0.18,
          duration: 620,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(markOpacity, {
          toValue: 0,
          duration: 520,
          delay: 220,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 820,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 640,
          delay: 160,
          useNativeDriver: true,
        }),
        Animated.timing(contentRise, {
          toValue: 0,
          duration: 640,
          delay: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      spinLoop.stop();
      orbitLoop.stop();
      ringLoop.stop();
      setIntroDone(true);
    });
  }, [
    bloom,
    contentOpacity,
    contentRise,
    markOpacity,
    markScale,
    orbit,
    overlayOpacity,
    ring,
    spin,
  ]);

  const spinRotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const orbitRotate = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const ringRotate = ring.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });
  const bloomScale = bloom.interpolate({
    inputRange: [0, 1],
    outputRange: [0.02, 1],
  });

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.flex,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentRise }],
          },
        ]}
      >
        <Screen
          edges={['top', 'left', 'right', 'bottom']}
          contentStyle={styles.content}
          footer={
            <View style={styles.footer}>
              <Button
                size="lg"
                block
                iconRight="arrow-right"
                onPress={() => router.push('/(onboarding)/name')}
              >
                Get started
              </Button>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                onPress={() => router.push('/(onboarding)/save')}
                style={styles.signInRow}
              >
                <Text style={styles.signInMuted}>Already have an account? </Text>
                <Text style={styles.signInLink}>Sign in</Text>
              </PressableScale>
            </View>
          }
        >
          <View style={styles.bleed} pointerEvents="none" />
          <View style={styles.hero}>
            <Image
              source={MARLIN}
              style={styles.mark}
              resizeMode="contain"
              accessibilityLabel="Noni"
            />
            <View style={styles.copy}>
              <Wordmark size={type.size.titleXl} />
              <Text style={styles.headline}>UGC Made Easy</Text>
            </View>
          </View>
        </Screen>
      </Animated.View>

      {!introDone ? (
        <Animated.View
          pointerEvents="auto"
          style={[styles.intro, { opacity: overlayOpacity }]}
        >
          <Animated.View
            style={[
              styles.bloom,
              {
                transform: [{ scale: bloomScale }],
              },
            ]}
          />

          <View style={styles.introCenter} pointerEvents="none">
            <Animated.View
              style={[
                styles.ring,
                styles.ringOuter,
                { transform: [{ rotate: ringRotate }] },
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                styles.ringInner,
                { transform: [{ rotate: orbitRotate }] },
              ]}
            />

            <Animated.View
              style={[styles.orbit, { transform: [{ rotate: orbitRotate }] }]}
            >
              {Array.from({ length: ORBIT_COUNT }, (_, i) => {
                const deg = (360 / ORBIT_COUNT) * i;
                return (
                  <View
                    key={i}
                    style={[
                      styles.orbitSlot,
                      {
                        transform: [
                          { rotate: `${deg}deg` },
                          { translateY: -ORBIT_RADIUS },
                        ],
                      },
                    ]}
                  >
                    <Image
                      source={MARLIN}
                      style={styles.orbitMark}
                      resizeMode="contain"
                    />
                  </View>
                );
              })}
            </Animated.View>

            <Animated.Image
              source={MARLIN}
              style={[
                styles.introMark,
                {
                  opacity: markOpacity,
                  transform: [{ rotate: spinRotate }, { scale: markScale }],
                },
              ]}
              resizeMode="contain"
            />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.white,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  bleed: {
    position: 'absolute',
    top: -(space[11] * 3 + space[5]),
    left: -(space[11] * 2 + space[5]),
    width: space[11] * 10 + space[7],
    height: space[11] * 10 + space[7],
    borderRadius: radius.pill,
    backgroundColor: color.blue50,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: space.sectionGap,
  },
  mark: {
    width: LOGO_MARK,
    height: LOGO_MARK,
    marginLeft: -space[2],
  },
  copy: {
    gap: space[5],
  },
  headline: {
    fontSize: type.size.hero,
    lineHeight: type.size.hero * type.leading.tight,
    letterSpacing: type.tracking.hero,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  footer: {
    gap: space[4],
    alignItems: 'center',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: space[2],
  },
  signInMuted: {
    fontSize: type.size.bodySm,
    color: color.slate500,
  },
  signInLink: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  intro: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  bloom: {
    position: 'absolute',
    width: BLOOM_SIZE,
    height: BLOOM_SIZE,
    borderRadius: BLOOM_SIZE / 2,
    backgroundColor: color.accent,
  },
  introCenter: {
    width: ORBIT_RADIUS * 2 + 64,
    height: ORBIT_RADIUS * 2 + 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderColor: color.accent,
  },
  ringOuter: {
    width: ORBIT_RADIUS * 2 + 36,
    height: ORBIT_RADIUS * 2 + 36,
    borderRadius: ORBIT_RADIUS + 18,
    borderWidth: 1.5,
    opacity: 0.4,
  },
  ringInner: {
    width: ORBIT_RADIUS * 2 - 28,
    height: ORBIT_RADIUS * 2 - 28,
    borderRadius: ORBIT_RADIUS - 14,
    borderWidth: 1.5,
    opacity: 0.28,
  },
  orbit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitSlot: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitMark: {
    width: 34,
    height: 34,
  },
  introMark: {
    width: 112,
    height: 112,
  },
});
