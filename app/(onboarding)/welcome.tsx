import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { PressableScale } from '../../components/ui/PressableScale';
import { Wordmark } from '../../components/ui/Wordmark';
import { color, space, type } from '../../theme/tokens';

export default function WelcomeScreen() {
  return (
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
          source={require('../../assets/noni-logo-mark-transparent.png')}
          style={styles.mark}
          resizeMode="contain"
          accessibilityLabel="Noni"
        />
        <View style={styles.copy}>
          <Wordmark size={type.size.titleXl} />
          <Text style={styles.headline}>Get paid to post.</Text>
          <Text style={styles.body}>
            We send you the post, you shoot it, we edit and publish it. You get
            paid for every post that goes live.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

/** Design mark is 132px; Wave 1 tokens have no logo-mark size. */
const LOGO_MARK = 132;

const styles = StyleSheet.create({
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
    borderRadius: 999,
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
  body: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
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
});
