import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '../../components/layout/Screen';
import { PressableScale } from '../../components/ui/PressableScale';
import { BubbleMark } from '../../components/ui/Wordmark';
import { routeAfterSignIn, signInWithGoogle } from '../../lib/auth-session';
import { color, radius, space, type } from '../../theme/tokens';

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
const ROCKET_SIZE = 150;
const INTRO_ROCKET = 116;

/** Official multicolor Google G. Brand mark, not a token colour. */
function GoogleMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  const pop = useRef(new Animated.Value(0)).current;
  const flight = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.spring(pop, {
        toValue: 1,
        friction: 5,
        tension: 130,
        useNativeDriver: true,
      }),
      Animated.delay(140),
      Animated.parallel([
        Animated.timing(flight, {
          toValue: 1,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(reveal, {
          toValue: 1,
          duration: 760,
          delay: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setIntroDone(true));
  }, [flight, pop, reveal]);

  const flightX = flight.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, WIN_W * 0.16, WIN_W * 0.85],
  });
  const flightY = flight.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -WIN_H * 0.42, -WIN_H * 0.95],
  });
  const flightTilt = flight.interpolate({
    inputRange: [0, 1],
    outputRange: ['-16deg', '6deg'],
  });
  const rocketOpacity = flight.interpolate({
    inputRange: [0, 0.82, 1],
    outputRange: [1, 1, 0],
  });
  const contentRise = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  async function handleGoogle() {
    setBusy(true);
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn) await routeAfterSignIn();
    } catch (e) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Google',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.flex,
          { opacity: reveal, transform: [{ translateY: contentRise }] },
        ]}
      >
        <View style={styles.bleed} pointerEvents="none" />

        <Screen
          edges={['top', 'left', 'right', 'bottom']}
          bg="transparent"
          contentStyle={styles.content}
        >
          <View style={styles.hero}>
            <BubbleMark size={ROCKET_SIZE} />
            <Text style={styles.welcome}>Welcome to Noni!</Text>
            <Text style={styles.headline}>UGC Made Easy</Text>
            <Text style={styles.body}>
              Sign in with the Google account your invite was sent to.
            </Text>
          </View>

          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={busy}
            onPress={() => void handleGoogle()}
            style={[styles.googleBtn, busy && styles.btnDisabled]}
          >
            {busy ? (
              <ActivityIndicator color={color.ink} />
            ) : (
              <>
                <GoogleMark size={19} />
                <Text style={styles.googleLabel}>Continue with Google</Text>
              </>
            )}
          </PressableScale>
        </Screen>
      </Animated.View>

      {!introDone ? (
        <View pointerEvents="none" style={styles.intro}>
          <Animated.View
            style={[
              styles.introRocket,
              {
                opacity: rocketOpacity,
                transform: [
                  { translateX: flightX },
                  { translateY: flightY },
                  { rotate: flightTilt },
                  { scale: pop },
                ],
              },
            ]}
          >
            <BubbleMark size={INTRO_ROCKET} />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: color.white,
  },
  flex: {
    flex: 1,
  },
  intro: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  introRocket: {
    marginTop: WIN_H * 0.08,
    marginRight: WIN_W * 0.2,
  },
  bleed: {
    position: 'absolute',
    top: -180,
    left: -120,
    width: 420,
    height: 420,
    borderRadius: radius.pill,
    backgroundColor: color.blue50,
  },
  content: {
    flex: 1,
    paddingBottom: space[3],
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcome: {
    marginTop: space[6],
    fontFamily: type.font.rounded,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.2,
    color: color.blue600,
    textAlign: 'center',
  },
  headline: {
    marginTop: space[2],
    fontSize: 40,
    lineHeight: 40 * type.leading.tight,
    letterSpacing: type.tracking.hero,
    fontWeight: type.weight.heavy,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    marginTop: space[4],
    maxWidth: 280,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.slate500,
    textAlign: 'center',
  },
  googleBtn: {
    height: 52,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  googleLabel: {
    color: color.ink,
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    letterSpacing: -0.1,
  },
});
