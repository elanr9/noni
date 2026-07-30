import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LoadingScreen, Screen, colors } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import {
  createTask,
  generateTaskDraft,
  listCreators,
  listTrends,
  startTrendScrape,
  type TrendItem,
} from '../../lib/admin-api';
import type { Profile } from '../../lib/profile';

function formatViews(views: number | null): string {
  if (!views) return 'views unknown';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

export default function TrendsScreen() {
  const { profile } = useAuth();
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [creators, setCreators] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [openTrendId, setOpenTrendId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [t, c] = await Promise.all([
        listTrends(),
        listCreators(profile.company_id),
      ]);
      setTrends(t);
      setCreators(c.filter((p) => p.role === 'creator'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function scrapeNow() {
    setScraping(true);
    try {
      await startTrendScrape();
      Alert.alert(
        'Scraping started',
        'New trends land here in a few minutes. Pull to refresh.',
      );
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setScraping(false);
    }
  }

  async function turnIntoTask(trend: TrendItem) {
    if (!profile || !assignee) return;
    setCreatingId(trend.id);
    try {
      const draft = await generateTaskDraft(trend.id);
      const due = new Date();
      due.setDate(due.getDate() + 1);
      await createTask({
        companyId: profile.company_id,
        createdBy: profile.id,
        assignedTo: assignee,
        title: draft.title,
        script: draft.script,
        caption: draft.caption,
        dueDate: due.toISOString().slice(0, 10),
        inspirationTrendId: trend.id,
        brief: draft.brief,
        format: draft.format,
        estimatedSeconds: draft.estimatedSeconds,
      });
      setOpenTrendId(null);
      setAssignee(null);
      Alert.alert('Task created', `"${draft.title}" is in the queue, due tomorrow.`);
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setCreatingId(null);
    }
  }

  if (loading) return <LoadingScreen label="Loading trends" />;

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
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
        <Pressable
          style={[styles.scrapeBtn, scraping && styles.disabled]}
          disabled={scraping}
          onPress={() => void scrapeNow()}
        >
          <Text style={styles.scrapeText}>
            {scraping ? 'Starting…' : 'Scrape now'}
          </Text>
        </Pressable>

        {trends.length === 0 ? (
          <Text style={styles.empty}>
            No trends yet. Tap Scrape now, then pull to refresh in a few
            minutes. The weekly scrape also fills this feed automatically.
          </Text>
        ) : (
          trends.map((t) => (
            <View key={t.id} style={styles.card}>
              {t.cover_url ? (
                <Image
                  source={{ uri: t.cover_url }}
                  style={styles.cover}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={styles.cardMeta}>
                {t.platform === 'instagram' ? 'Instagram' : 'TikTok'}
                {t.author_handle ? ` · @${t.author_handle}` : ''}
                {` · ${formatViews(t.views)}`}
              </Text>
              {t.hook ? <Text style={styles.hook}>{t.hook}</Text> : null}
              {t.why_it_works ? (
                <Text style={styles.why}>{t.why_it_works}</Text>
              ) : null}

              <View style={styles.actionRow}>
                {t.source_url ? (
                  <Pressable
                    style={styles.watchBtn}
                    onPress={() => void Linking.openURL(t.source_url!)}
                  >
                    <Text style={styles.watchText}>Watch</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.taskBtn}
                  onPress={() => {
                    setAssignee(null);
                    setOpenTrendId(openTrendId === t.id ? null : t.id);
                  }}
                >
                  <Text style={styles.taskText}>
                    {openTrendId === t.id ? 'Close' : 'Turn into task'}
                  </Text>
                </Pressable>
              </View>

              {openTrendId === t.id ? (
                <View style={styles.assignBox}>
                  <Text style={styles.label}>Assign to</Text>
                  <View style={styles.chipRow}>
                    {creators.map((c) => (
                      <Pressable
                        key={c.id}
                        style={[styles.chip, assignee === c.id && styles.chipOn]}
                        onPress={() =>
                          setAssignee(assignee === c.id ? null : c.id)
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            assignee === c.id && styles.chipTextOn,
                          ]}
                        >
                          {c.full_name ?? 'Unnamed'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    style={[
                      styles.createBtn,
                      (!assignee || creatingId === t.id) && styles.disabled,
                    ]}
                    disabled={!assignee || creatingId === t.id}
                    onPress={() => void turnIntoTask(t)}
                  >
                    <Text style={styles.createText}>
                      {creatingId === t.id ? 'Writing the brief…' : 'Create task'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  scrapeBtn: {
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scrapeText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { fontSize: 15, color: colors.muted, lineHeight: 22, marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 8,
  },
  cover: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: '#0B0B0F',
  },
  cardMeta: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  hook: { fontSize: 17, fontWeight: '700', color: colors.ink, lineHeight: 23 },
  why: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  watchBtn: {
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  watchText: { color: colors.ink, fontWeight: '600' },
  taskBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  taskText: { color: '#fff', fontWeight: '700' },
  assignBox: { gap: 10, marginTop: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  createBtn: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
