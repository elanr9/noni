import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/ui/Button';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  createTask,
  generateTaskDraft,
  listCreators,
  listTrends,
  startTrendScrape,
  type TrendItem,
} from '../../../lib/admin-api';
import type { Profile } from '../../../lib/profile';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

function formatViews(views: number | null): string {
  if (!views) return 'views unknown';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

export default function TrendsScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
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
        generated: true,
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 6, paddingBottom: 116 },
      ]}
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
      <Text style={styles.h1}>Trends</Text>
      <Text style={styles.subtitle}>
        Scraped posts with hooks worth turning into tasks.
      </Text>

      <Button
        size="sm"
        variant="primary"
        block
        icon="sparkles"
        disabled={scraping}
        onPress={() => void scrapeNow()}
        style={styles.scrapeBtn}
      >
        {scraping ? 'Starting…' : 'Scrape now'}
      </Button>

      {loading ? (
        <Text style={styles.empty}>Loading trends…</Text>
      ) : trends.length === 0 ? (
        <Text style={styles.empty}>
          No trends yet. Tap Scrape now, then pull to refresh in a few minutes.
        </Text>
      ) : (
        trends.map((t) => (
          <View key={t.id} style={[styles.card, shadow.shadowCard]}>
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
            {t.why_it_works ? <Text style={styles.why}>{t.why_it_works}</Text> : null}

            <View style={styles.actionRow}>
              {t.source_url ? (
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(t.source_url!)}
                  style={styles.watchBtn}
                >
                  <Text style={styles.watchText}>Watch</Text>
                </PressableScale>
              ) : null}
              <PressableScale
                accessibilityRole="button"
                onPress={() => {
                  setAssignee(null);
                  setOpenTrendId(openTrendId === t.id ? null : t.id);
                }}
                style={styles.taskBtn}
              >
                <Text style={styles.taskText}>
                  {openTrendId === t.id ? 'Close' : 'Turn into task'}
                </Text>
              </PressableScale>
            </View>

            {openTrendId === t.id ? (
              <View style={styles.assignBox}>
                <Text style={styles.label}>Assign to</Text>
                <View style={styles.chipRow}>
                  {creators.map((c) => {
                    const on = assignee === c.id;
                    return (
                      <PressableScale
                        key={c.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => setAssignee(on ? null : c.id)}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {c.full_name ?? 'Unnamed'}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
                <Button
                  size="md"
                  variant="secondary"
                  block
                  disabled={!assignee || creatingId === t.id}
                  onPress={() => void turnIntoTask(t)}
                >
                  {creatingId === t.id ? 'Writing the brief…' : 'Create task'}
                </Button>
              </View>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, gap: 12 },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
    marginTop: 10,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    marginBottom: 4,
  },
  scrapeBtn: { marginBottom: 4 },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    lineHeight: 22,
    fontWeight: '600',
    marginTop: 8,
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 8,
  },
  cover: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.sm,
    backgroundColor: color.ink900,
  },
  cardMeta: {
    fontSize: type.size.chip,
    color: color.slate500,
    fontWeight: '600',
  },
  hook: {
    fontSize: type.size.card,
    fontWeight: '700',
    color: color.ink,
    lineHeight: 23,
  },
  why: {
    fontSize: type.size.meta,
    color: color.slate500,
    lineHeight: 20,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  watchBtn: {
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  watchText: { color: color.ink, fontWeight: '600' },
  taskBtn: {
    backgroundColor: color.blue500,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  taskText: { color: color.white, fontWeight: '700' },
  assignBox: { gap: 10, marginTop: 6 },
  label: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  chipOn: { backgroundColor: color.blue100 },
  chipText: { color: color.slate500, fontWeight: '700' },
  chipTextOn: { color: color.blue700 },
});
