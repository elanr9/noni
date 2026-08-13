import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { AccountSwitcherSheet } from '../components/AccountSwitcherSheet';
import { LoadingScreen, Screen } from '../components/layout/Screen';
import { Button } from '../components/ui/Button';
import { profileIsPlatformAdmin } from '../lib/active-mode';
import { useAuth } from '../lib/auth';
import { destinationForProfile } from '../lib/profile';
import { color, space, type } from '../theme/tokens';

const OPS_URL = 'https://www.usenoni.app/ops';

/** The single Noni platform account manages everything on the website. */
export default function PlatformAdminScreen() {
  const { session, profile, loading, activeMode, signOut } = useAuth();
  const [switcherVisible, setSwitcherVisible] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!session || !profile || !profileIsPlatformAdmin(profile)) {
    return <Redirect href={destinationForProfile(profile, !!session, activeMode)} />;
  }

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={styles.title}>Noni ops lives on the web</Text>
        <Text style={styles.copy}>
          This account runs the Noni platform. Company setup, invites, and the
          overview dashboard are on the website.
        </Text>
        <Button block onPress={() => void Linking.openURL(OPS_URL)}>
          Open usenoni.app/ops
        </Button>
        <Button block variant="ghost" onPress={() => setSwitcherVisible(true)}>
          Switch view
        </Button>
        <Button block variant="ghost" onPress={() => void signOut()}>
          Sign out
        </Button>
      </View>
      <AccountSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: space[5],
  },
  title: {
    color: color.ink,
    fontSize: type.size.title,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    textAlign: 'center',
  },
  copy: {
    color: color.textMuted,
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    textAlign: 'center',
    marginBottom: space[3],
  },
});
