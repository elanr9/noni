import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { LoadingScreen, Screen, colors } from '../../../components/Screen';
import { StatusChip } from '../../../components/StatusChip';
import { useAuth } from '../../../lib/auth';
import { getTask } from '../../../lib/tasks-api';
import {
  latestSubmission,
  reviewTask,
  signedVideoUrl,
  type Submission,
} from '../../../lib/admin-api';
import type { ContentTask } from '../../../lib/tasks';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [task, setTask] = useState<ContentTask | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const player = useVideoPlayer(videoUrl ?? null, (p) => {
    p.loop = true;
    if (videoUrl) p.play();
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const t = await getTask(id);
      setTask(t);
      if (t) {
        const sub = await latestSubmission(t.id);
        setSubmission(sub);
        if (sub) setVideoUrl(await signedVideoUrl(sub.video_path));
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

  async function decide(action: 'approved' | 'changes_requested') {
    if (!task || !profile) return;
    if (!submission) {
      Alert.alert('No submission', 'Nothing was uploaded for this task yet.');
      return;
    }
    if (action === 'changes_requested' && note.trim().length === 0) {
      Alert.alert('Add a note', 'Tell the creator what to change.');
      return;
    }
    setBusy(true);
    try {
      await reviewTask({
        task,
        submissionId: submission.id,
        reviewerId: profile.id,
        action,
        note: note.trim() || null,
      });
      router.back();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!task) {
    return (
      <Screen>
        <Text style={styles.muted}>Task not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <StatusChip status={task.status} />
        <Text style={styles.title}>{task.title}</Text>

        {videoUrl ? (
          <VideoView
            style={styles.video}
            player={player}
            contentFit="contain"
            nativeControls
          />
        ) : (
          <View style={[styles.video, styles.noVideo]}>
            <Text style={styles.muted}>No video submitted</Text>
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Script</Text>
          <Text style={styles.blockBody}>{task.script ?? '—'}</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>Caption</Text>
          <Text style={styles.blockBody}>{task.caption ?? '—'}</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Note for changes (required to request changes)"
          placeholderTextColor="#9A9AA3"
          value={note}
          onChangeText={setNote}
          multiline
        />

        <View style={styles.row}>
          <Pressable
            style={[styles.reject, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void decide('changes_requested')}
          >
            <Text style={styles.btnText}>Request changes</Text>
          </Pressable>
          <Pressable
            style={[styles.approve, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void decide('approved')}
          >
            <Text style={styles.btnText}>Approve</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  video: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 420,
    borderRadius: 18,
    backgroundColor: '#000',
  },
  noVideo: { alignItems: 'center', justifyContent: 'center' },
  block: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 6,
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  blockBody: { fontSize: 15, lineHeight: 22, color: colors.ink },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    borderRadius: 14,
    padding: 14,
    minHeight: 70,
    fontSize: 15,
    color: colors.ink,
  },
  row: { flexDirection: 'row', gap: 12 },
  reject: {
    flex: 1,
    backgroundColor: '#C1121F',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  approve: {
    flex: 1,
    backgroundColor: '#2D6A4F',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  muted: { color: colors.muted, fontSize: 15 },
});
