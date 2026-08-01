import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useFocusEffect, type Href } from 'expo-router';

import { BrandTitle, LoadingScreen, Screen, colors } from '../../../components/Screen';
import { StatusChip } from '../../../components/StatusChip';
import { useAuth } from '../../../lib/auth';
import { listQueue, type QueueItem } from '../../../lib/admin-api';

export default function QueueScreen() {
  const { signOut } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listQueue());
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

  if (loading) return <LoadingScreen label="Loading queue" />;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <BrandTitle
          title="Queue"
          subtitle={`${items.length} waiting for review`}
        />

        <View style={styles.navRow}>
          <Link href="/(admin)/(tabs)/calendar" asChild>
            <Pressable style={styles.navBtn}>
              <Text style={styles.navText}>Calendar</Text>
            </Pressable>
          </Link>
          <Link href={'/(admin)/(tabs)/trends' as Href} asChild>
            <Pressable style={styles.navBtn}>
              <Text style={styles.navText}>Trends</Text>
            </Pressable>
          </Link>
          <Link href={'/(admin)/brain' as Href} asChild>
            <Pressable style={styles.navBtn}>
              <Text style={styles.navText}>Brain</Text>
            </Pressable>
          </Link>
          <Link href={'/(admin)/(tabs)/analytics' as Href} asChild>
            <Pressable style={styles.navBtn}>
              <Text style={styles.navText}>Analytics</Text>
            </Pressable>
          </Link>
          <Link href={'/(admin)/(tabs)/settings' as Href} asChild>
            <Pressable style={styles.navBtn}>
              <Text style={styles.navText}>Settings</Text>
            </Pressable>
          </Link>
          <Pressable style={styles.ghost} onPress={() => void signOut()}>
            <Text style={styles.ghostText}>Sign out</Text>
          </Pressable>
        </View>

        {items.length === 0 ? (
          <Text style={styles.empty}>
            Nothing to review. Create tasks from Calendar.
          </Text>
        ) : (
          items.map((item) => (
            <Link key={item.id} href={`/(admin)/review/${item.id}`} asChild>
              <Pressable style={styles.card}>
                <StatusChip status={item.status} />
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardMeta}>
                  {item.profiles?.full_name ?? 'Unassigned'}
                  {item.due_date ? ` · due ${item.due_date}` : ''}
                </Text>
              </Pressable>
            </Link>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navBtn: {
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  navText: { color: '#fff', fontWeight: '700' },
  ghost: { padding: 8 },
  ghostText: { color: colors.muted, fontWeight: '600' },
  empty: { color: colors.muted, fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: 14, color: colors.muted },
});
