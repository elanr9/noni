import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { ReviewThread } from '../../../components/ReviewThread';
import { StatusChip } from '../../../components/StatusChip';
import { color, shadow } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import { latestSubmission, setTaskFeedback } from '../../../lib/admin-api';
import {
  insertComment,
  latestChangesNote,
  listTaskReviewEvents,
  type ReviewEvent,
} from '../../../lib/review-events';
import { getTask, transitionTask, type TaskWithTrend } from '../../../lib/tasks-api';
import { nextCreatorAction } from '../../../lib/tasks';

/** linear-gradient(160deg, #E7F4FD 0%, #DCE7F0 100%) placeholder frame. */
function PlaceholderGradient() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="taskPlayerPh" x1="0%" y1="0%" x2="34%" y2="94%">
          <Stop offset="0" stopColor="#E7F4FD" />
          <Stop offset="1" stopColor="#DCE7F0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#taskPlayerPh)" />
    </Svg>
  );
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [task, setTask] = useState<TaskWithTrend | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const t = await getTask(id);
      setTask(t);
      if (t) {
        const [thread, sub] = await Promise.all([
          listTaskReviewEvents(t.id),
          latestSubmission(t.id),
        ]);
        setEvents(thread);
        setSubmissionId(sub?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={color.accent} />
      </View>
    );
  }
  if (!task) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.nav}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Icon name="chevron-left" size={20} color={color.ink} />
          </PressableScale>
        </View>
        <Text style={styles.missing}>Task not found.</Text>
      </View>
    );
  }

  const action = nextCreatorAction(task.status);
  const sendAction = action && action.to === 'submitted' ? action : null;

  async function runAction() {
    if (!sendAction || !task) return;
    setBusy(true);
    try {
      const updated = await transitionTask(task.id, task.status, sendAction.to);
      setTask({ ...updated, trend_items: task.trend_items });
      Alert.alert('Sent for review', 'Admins will take a look.');
    } catch (e) {
      Alert.alert(
        'Could not update',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setBusy(false);
    }
  }

  const trend = task.trend_items;
  const cover = trend?.cover_url ?? null;
  const isVideo = task.format !== 'photo_carousel';
  const canRecord =
    task.status === 'assigned' ||
    task.status === 'changes_requested' ||
    task.status === 'recorded';
  const changesNote = latestChangesNote(events);
  const loopOpen = task.status !== 'approved' && task.status !== 'posted';
  const hasScript = Boolean(task.script?.trim());

  // Creator thumbs on the generated idea; training signal for generation.
  async function rateDraft(value: 1 | -1) {
    if (!task) return;
    const next = task.feedback === value ? null : value;
    setTask({ ...task, feedback: next });
    try {
      await setTaskFeedback(task.id, next);
    } catch {
      setTask(task);
    }
  }

  async function sendComment(text: string) {
    if (!task || !profile || !submissionId) {
      throw new Error('No submission to comment on');
    }
    await insertComment({
      submissionId,
      authorId: profile.id,
      note: text,
      taskId: task.id,
    });
    setEvents(await listTaskReviewEvents(task.id));
  }

  function onPrimary() {
    if (!task) return;
    if (isVideo) {
      router.push(`/(creator)/record/${task.id}`);
      return;
    }
    Alert.alert(
      'Create slides',
      'Photo carousel posting is coming soon. For now, open the inspiration above and shoot the slides to match.',
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.nav}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={20} color={color.ink} />
        </PressableScale>
        <StatusChip status={task.status} />
      </View>

      <View style={styles.playerWrap}>
        <View style={[styles.player, shadow.shadowMedia]}>
          <View style={styles.playerClip}>
            {cover ? (
              <Image
                source={{ uri: cover }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <PlaceholderGradient />
            )}
            <View style={styles.playWrap} pointerEvents="box-none">
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={isVideo ? 'Watch inspiration' : 'Open inspiration'}
                disabled={!trend?.source_url}
                onPress={() =>
                  trend?.source_url ? void Linking.openURL(trend.source_url) : null
                }
                style={[styles.play, shadow.shadowMedia]}
              >
                <Icon
                  name={isVideo ? 'play' : 'images'}
                  size={26}
                  color={color.ink}
                />
              </PressableScale>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>{task.title}</Text>
        {task.brief ? <Text style={styles.description}>{task.brief}</Text> : null}
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>This idea:</Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Good idea"
            style={[styles.rateBtn, task.feedback === 1 && styles.rateBtnOn]}
            onPress={() => void rateDraft(1)}
          >
            <Icon
              name="thumbs-up"
              size={15}
              color={task.feedback === 1 ? color.white : color.ink}
            />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Bad idea"
            style={[styles.rateBtn, task.feedback === -1 && styles.rateBtnOn]}
            onPress={() => void rateDraft(-1)}
          >
            <Icon
              name="thumbs-down"
              size={15}
              color={task.feedback === -1 ? color.white : color.ink}
            />
          </PressableScale>
        </View>
      </View>

      {task.status === 'changes_requested' ? (
        <ScrollView
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          showsVerticalScrollIndicator={false}
        >
          {changesNote ? (
            <View style={styles.changesBanner}>
              <Text style={styles.changesLabel}>Changes requested</Text>
              <Text style={styles.changesBody}>{changesNote}</Text>
            </View>
          ) : null}
          <ReviewThread
            events={events}
            onSendComment={sendComment}
            composerEnabled={loopOpen && !!submissionId}
          />
        </ScrollView>
      ) : (
        <View style={styles.spacer} />
      )}

      {canRecord || sendAction ? (
        <View style={[styles.cta, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
          {sendAction ? (
            <Button
              variant="secondary"
              size="md"
              block
              disabled={busy}
              onPress={() => void runAction()}
            >
              {busy ? 'Updating…' : sendAction.label}
            </Button>
          ) : null}
          {canRecord ? (
            <Button
              variant="primary"
              size="lg"
              block
              icon={isVideo ? 'video' : 'images'}
              onPress={onPrimary}
            >
              {isVideo ? 'Record' : 'Create'}
            </Button>
          ) : null}
          {canRecord ? (
            <Text style={styles.caption}>
              {hasScript
                ? 'Your script runs in the teleprompter.'
                : 'No script — say it your way.'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.surface,
  },
  loading: {
    flex: 1,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: {
    paddingHorizontal: 24,
    paddingTop: 12,
    fontSize: 15,
    color: color.textMuted,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 6,
    minHeight: 46,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerWrap: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  player: {
    height: 292,
    borderRadius: 24,
    backgroundColor: color.white,
  },
  playerClip: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  playWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 62,
    height: 62,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 8,
  },
  title: {
    fontSize: 26,
    lineHeight: 30.7,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  description: {
    fontSize: 15,
    lineHeight: 22.5,
    fontWeight: '400',
    color: color.slate500,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  rateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
  rateBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  rateBtnOn: {
    backgroundColor: color.ink,
    borderColor: color.ink,
  },
  spacer: {
    flex: 1,
  },
  thread: {
    flex: 1,
    marginTop: 12,
  },
  threadContent: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 12,
  },
  changesBanner: {
    backgroundColor: color.amberSoft,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  changesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.amber,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  changesBody: {
    fontSize: 15,
    lineHeight: 22.5,
    color: color.ink,
  },
  cta: {
    paddingTop: 14,
    paddingHorizontal: 24,
    gap: 12,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
    textAlign: 'center',
  },
});
