import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '../../components/layout/Screen';
import { PressableScale } from '../../components/ui/PressableScale';
import { Wordmark } from '../../components/ui/Wordmark';
import {
  routeAfterSignIn,
  signInWithApple,
  signInWithGoogle,
} from '../../lib/auth-session';
import { color, radius, space, type } from '../../theme/tokens';

function AppleMark({ size, fill }: { size: number; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={fill}
        d="M16.365 1.43c0 1.14-.42 2.2-1.2 3.02-.9.96-2.2 1.7-3.4 1.6-.1-1.2.4-2.4 1.2-3.25.9-.95 2.35-1.65 3.4-1.37zM20.9 17.3c-.55 1.25-.8 1.8-1.5 2.9-.96 1.52-2.3 3.42-4 3.45-1.5.02-1.9-.98-3.95-.97-2.05.01-2.5.99-4 .97-1.7-.03-3-1.72-3.95-3.24C1.4 16.9.2 12.7 1.85 9.55c.9-1.7 2.5-2.8 4.25-2.83 1.6-.03 3.1 1.08 4 1.08.9 0 2.65-1.33 4.5-1.13.77.03 2.9.3 4.3 2.3-.1.07-2.55 1.5-2.52 4.45.03 3.55 3.1 4.72 3.12 4.73l-.6-.85z"
      />
    </Svg>
  );
}

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
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  async function handleGoogle() {
    setBusy('google');
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn) await routeAfterSignIn();
    } catch (e) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Google',
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleApple() {
    setBusy('apple');
    try {
      const signedIn = await signInWithApple();
      if (signedIn) await routeAfterSignIn();
    } catch (e) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Apple',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} contentStyle={styles.content}>
      <View style={styles.bleed} pointerEvents="none" />

      <View style={styles.hero}>
        <Wordmark size={type.size.titleXl} />
        <Text style={styles.headline}>Welcome back</Text>
        <Text style={styles.body}>Sign in to keep creating and getting paid.</Text>
      </View>

      <View style={styles.authStack}>
        {appleAvailable ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Sign in with Apple"
            disabled={busy !== null}
            onPress={() => {
              if (!busy) void handleApple();
            }}
            style={[styles.btn, styles.appleBtn, busy !== null && styles.btnDisabled]}
          >
            {busy === 'apple' ? (
              <ActivityIndicator color={color.white} />
            ) : (
              <>
                <AppleMark size={20} fill={color.white} />
                <Text style={styles.appleLabel}>Continue with Apple</Text>
              </>
            )}
          </PressableScale>
        ) : null}

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
          disabled={busy !== null}
          onPress={() => void handleGoogle()}
          style={[styles.btn, styles.googleBtn, busy !== null && styles.btnDisabled]}
        >
          {busy === 'google' ? (
            <ActivityIndicator color={color.ink} />
          ) : (
            <>
              <GoogleMark size={22} />
              <Text style={styles.googleLabel}>Continue with Google</Text>
            </>
          )}
        </PressableScale>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Create an account"
          onPress={() => router.push('/(onboarding)/welcome')}
          style={styles.footerLink}
        >
          <Text style={styles.footerMuted}>New here? </Text>
          <Text style={styles.footerStrong}>Get started</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
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
    gap: space[4],
    paddingBottom: space[8],
  },
  headline: {
    fontSize: type.size.hero,
    lineHeight: type.size.hero * type.leading.tight,
    letterSpacing: type.tracking.hero,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  body: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
    maxWidth: 280,
  },
  authStack: {
    gap: space[3],
    paddingBottom: space[4],
  },
  btn: {
    height: 60,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  appleBtn: {
    backgroundColor: color.ink,
  },
  appleLabel: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
  },
  googleBtn: {
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
  },
  googleLabel: {
    color: color.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  footerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: space[3],
  },
  footerMuted: {
    fontSize: type.size.bodySm,
    color: color.slate500,
  },
  footerStrong: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
});
