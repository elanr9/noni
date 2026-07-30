import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { LoadingScreen, Screen, colors } from '../../../components/Screen';
import { StatusChip } from '../../../components/StatusChip';
import { getTask, transitionTask, type TaskWithTrend } from '../../../lib/tasks-api';
import { bountyLabel, recordTimeLabel } from '../../../lib/bounty';
import { nextCreatorAction } from '../../../lib/tasks';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskWithTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setTask(await getTask(id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <LoadingScreen />;
  if (!task) {
    return (
      <Screen>
        <Text style={styles.missing}>Task not found.</Text>
      </Screen>
    );
  }

  const action = nextCreatorAction(task.status);

  async function runAction() {
    if (!action || !task) return;
    setBusy(true);
    try {
      const updated = await transitionTask(task.id, task.status, action.to);
      setTask({ ...updated, trend_items: task.trend_items });
      if (action.to === 'submitted') {
        Alert.alert('Sent for review', 'Admins will take a look.');
      }
    } catch (e) {
      Alert.alert(
        'Could not update',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setBusy(false);
    }
  }

  const hookLine = task.script?.split('\n').find((l) => l.trim().length > 0);
  const trend = task.trend_items;
  const cover = trend?.cover_url ?? null;
  const time = recordTimeLabel(task.estimated_seconds);
  const isVideo = task.format !== 'photo_carousel';
  const canRecord =
    task.status === 'assigned' ||
    task.status === 'changes_requested' ||
    task.status === 'recorded';

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {cover ? (
          <Pressable
            style={styles.hero}
            disabled={!trend?.source_url}
            onPress={() =>
              trend?.source_url ? void Linking.openURL(trend.source_url) : null
            }
          >
            <Image source={{ uri: cover }} style={styles.heroImg} resizeMode="cover" />
            <View style={styles.heroTab}>
              <Text style={styles.heroTabText}>
                {isVideo ? 'Video' : 'Slideshow'}
              </Text>
            </View>
            {trend?.source_url ? (
              <View style={styles.watchPill}>
                <Text style={styles.watchText}>Watch inspiration</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <StatusChip status={task.status} />
        <Text style={styles.title}>{task.title}</Text>

        <View style={styles.metaRow}>
          {time ? <Text style={styles.metaStrong}>{time}</Text> : null}
          {time ? <Text style={styles.metaDot}>·</Text> : null}
          <Text style={styles.bounty}>{bountyLabel()}</Text>
          {task.due_date ? <Text style={styles.metaDot}>·</Text> : null}
          {task.due_date ? (
            <Text style={styles.meta}>Due {task.due_date}</Text>
          ) : null}
        </View>

        {task.brief ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>The brief</Text>
            <Text style={styles.blockBody}>{task.brief}</Text>
          </View>
        ) : null}

        {hookLine ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Hook</Text>
            <Text style={styles.blockBody}>{hookLine}</Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>
            {isVideo ? 'Script' : 'Slide copy'}
          </Text>
          <Text style={styles.blockBody}>{task.script ?? 'No script yet.'}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Caption</Text>
          <Text style={styles.blockBody}>{task.caption ?? 'No caption yet.'}</Text>
        </View>

        {canRecord && isVideo ? (
          <Pressable
            style={styles.record}
            onPress={() => router.push(`/(creator)/record/${task.id}`)}
          >
            <Text style={styles.recordText}>Record</Text>
          </Pressable>
        ) : null}

        {canRecord && !isVideo ? (
          <View style={styles.stub}>
            <Text style={styles.stubText}>
              Photo carousel posting is coming soon. For now, open the
              inspiration above and shoot the slides to match.
            </Text>
          </View>
        ) : null}

        {action && action.to === 'submitted' ? (
          <Pressable
            style={[styles.secondary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void runAction()}
          >
            <Text style={styles.secondaryText}>
              {busy ? 'Updating…' : action.label}
            </Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>Back to Today</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 14 },
  missing: { fontSize: 17, color: colors.muted },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  meta: { fontSize: 15, color: colors.muted },
  hero: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0B0B0F',
  },
  heroImg: { width: '100%', height: '100%' },
  heroTab: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(11,11,15,0.78)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroTabText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  watchPill: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  watchText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metaStrong: { fontSize: 15, fontWeight: '700', color: colors.ink },
  metaDot: { fontSize: 15, color: colors.muted },
  bounty: { fontSize: 15, fontWeight: '800', color: colors.accent },
  stub: {
    backgroundColor: '#FFF3E9',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F2D3B8',
  },
  stubText: { fontSize: 15, lineHeight: 22, color: colors.ink },
  block: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 8,
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  blockBody: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  record: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  recordText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  secondary: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  back: { alignItems: 'center', paddingVertical: 12 },
  backText: { color: colors.muted, fontWeight: '600', fontSize: 15 },
});
