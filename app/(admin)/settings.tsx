import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Screen, colors } from '../../components/Screen';
import {
  listCreatorSocialStatus,
  type CreatorSocialStatus,
} from '../../lib/admin-api';

function connectedSummary(accounts: Record<string, unknown>): string {
  const parts: string[] = [];
  if (accounts.tiktok) parts.push('TikTok');
  if (accounts.instagram) parts.push('Instagram');
  return parts.length > 0 ? parts.join(' · ') : 'Not connected';
}

export default function AdminSettingsScreen() {
  const [members, setMembers] = useState<CreatorSocialStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await listCreatorSocialStatus());
    } catch (e) {
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={styles.content}
      >
        <Text style={styles.h1}>Creator socials</Text>
        <Text style={styles.body}>
          Creators connect their own TikTok and Instagram. Approved content
          posts to those accounts.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.ink} />
        ) : members.length === 0 ? (
          <Text style={styles.empty}>No creators yet.</Text>
        ) : (
          members.map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.name}>{m.full_name ?? 'Creator'}</Text>
              <Text style={styles.meta}>{connectedSummary(m.social_accounts)}</Text>
            </View>
          ))
        )}

        <Pressable style={styles.refresh} onPress={() => void load()}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12 },
  h1: { fontSize: 28, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.muted, marginBottom: 8 },
  empty: { color: colors.muted, fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E2DC',
    gap: 4,
  },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 14, color: colors.muted },
  refresh: { paddingVertical: 12, alignItems: 'center' },
  refreshText: { color: colors.ink, fontWeight: '600' },
});
