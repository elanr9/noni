import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';

import { Screen, colors } from '../../components/Screen';
import {
  getSocialConnectStatus,
  getSocialConnectUrl,
  type SocialConnectStatus,
} from '../../lib/admin-api';

function accountLabel(value: unknown): string {
  if (!value) return 'Not connected';
  if (typeof value === 'string') {
    return value.length > 0 ? value : 'Not connected';
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as { display_name?: string; username?: string };
    return obj.display_name ?? obj.username ?? 'Connected';
  }
  return 'Connected';
}

export default function CreatorSettingsScreen() {
  const [status, setStatus] = useState<SocialConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getSocialConnectStatus());
    } catch (e) {
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function connect() {
    setBusy(true);
    try {
      const url = await getSocialConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      await load();
    } catch (e) {
      Alert.alert(
        'Connect failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  }

  const accounts = status?.social_accounts ?? {};

  return (
    <Screen style={styles.screen}>
      <Text style={styles.h1}>Your accounts</Text>
      <Text style={styles.body}>
        Connect TikTok and Instagram. When an admin approves your content, it
        posts to these accounts.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <View style={styles.box}>
          <Text style={styles.label}>TikTok</Text>
          <Text style={styles.value}>{accountLabel(accounts.tiktok)}</Text>
          <Text style={styles.label}>Instagram</Text>
          <Text style={styles.value}>{accountLabel(accounts.instagram)}</Text>
        </View>
      )}

      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void connect()}
      >
        <Text style={styles.btnText}>
          {busy ? 'Opening…' : 'Connect socials'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 12 },
  h1: { fontSize: 28, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.muted, marginBottom: 8 },
  box: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E6E2DC',
  },
  label: { fontSize: 12, color: colors.muted, marginTop: 8 },
  value: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  btn: {
    marginTop: 8,
    backgroundColor: colors.ink,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
