import { useCallback, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';

import { LoadingScreen, Screen, colors } from '../../components/Screen';
import { StatusChip } from '../../components/StatusChip';
import { useAuth } from '../../lib/auth';
import { listMyPosts, type TaskWithPosts } from '../../lib/tasks-api';

export default function MyPostsScreen() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<TaskWithPosts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setRows(await listMyPosts(profile.id));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <LoadingScreen label="Loading posts" />;

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
        {rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptyBody}>
              Finish a task and send it for review. It will show up here.
            </Text>
            <Link href="/(creator)" asChild>
              <Pressable style={styles.cta}>
                <Text style={styles.ctaText}>Go to Today</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          rows.map((task) => {
            const links = (task.posts ?? []).filter((p) => p.post_url);
            return (
              <Link key={task.id} href={`/(creator)/task/${task.id}`} asChild>
                <Pressable style={styles.card}>
                  <StatusChip status={task.status} />
                  <Text style={styles.title}>{task.title}</Text>
                  {links.length === 0 ? (
                    <Text style={styles.meta}>No live links yet</Text>
                  ) : (
                    links.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          if (p.post_url) void Linking.openURL(p.post_url);
                        }}
                      >
                        <Text style={styles.link}>
                          {(p.platform ?? 'post').toUpperCase()} · Open
                        </Text>
                      </Pressable>
                    ))
                  )}
                </Pressable>
              </Link>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { padding: 24, gap: 12, paddingBottom: 40 },
  emptyBox: { gap: 10, paddingTop: 24 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
  },
  emptyBody: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  cta: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  ctaText: { color: '#fff', fontWeight: '700' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 14, color: colors.muted },
  link: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
});
