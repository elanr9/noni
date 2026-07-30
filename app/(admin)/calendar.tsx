import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LoadingScreen, Screen, colors } from '../../components/Screen';
import { StatusChip } from '../../components/StatusChip';
import { useAuth } from '../../lib/auth';
import {
  createTask,
  generateTaskDraft,
  listAllTasks,
  listCreators,
  type QueueItem,
} from '../../lib/admin-api';
import type { Profile } from '../../lib/profile';

export default function CalendarScreen() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<QueueItem[]>([]);
  const [creators, setCreators] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');
  const [caption, setCaption] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [t, c] = await Promise.all([
        listAllTasks(),
        listCreators(profile.company_id),
      ]);
      setTasks(t);
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

  async function save() {
    if (!profile) return;
    if (!title.trim()) {
      Alert.alert('Title required');
      return;
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      Alert.alert('Date format', 'Use YYYY-MM-DD');
      return;
    }
    setBusy(true);
    try {
      await createTask({
        companyId: profile.company_id,
        createdBy: profile.id,
        assignedTo: assignee,
        title: title.trim(),
        script: script.trim() || null,
        caption: caption.trim() || null,
        dueDate: dueDate || null,
      });
      setTitle('');
      setScript('');
      setCaption('');
      setDueDate('');
      setAssignee(null);
      setShowForm(false);
      void load();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const draft = await generateTaskDraft();
      setTitle(draft.title);
      setScript(draft.script);
      setCaption(draft.caption);
    } catch (e) {
      Alert.alert('Generation failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <LoadingScreen label="Loading calendar" />;

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
        <Pressable style={styles.newBtn} onPress={() => setShowForm((s) => !s)}>
          <Text style={styles.newBtnText}>
            {showForm ? 'Close' : 'New task'}
          </Text>
        </Pressable>

        {showForm ? (
          <View style={styles.form}>
            <Pressable
              style={[styles.generateBtn, generating && styles.disabled]}
              disabled={generating}
              onPress={() => void generate()}
            >
              <Text style={styles.generateText}>
                {generating ? 'Writing…' : 'Generate with AI'}
              </Text>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor="#9A9AA3"
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, styles.multi]}
              placeholder="Script"
              placeholderTextColor="#9A9AA3"
              value={script}
              onChangeText={setScript}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Caption"
              placeholderTextColor="#9A9AA3"
              value={caption}
              onChangeText={setCaption}
            />
            <TextInput
              style={styles.input}
              placeholder="Due date YYYY-MM-DD"
              placeholderTextColor="#9A9AA3"
              value={dueDate}
              onChangeText={setDueDate}
              autoCapitalize="none"
            />
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
              style={[styles.saveBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void save()}
            >
              <Text style={styles.saveText}>
                {busy ? 'Creating…' : 'Create task'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {tasks.map((t) => (
          <View key={t.id} style={styles.card}>
            <StatusChip status={t.status} />
            <Text style={styles.cardTitle}>{t.title}</Text>
            <Text style={styles.cardMeta}>
              {t.profiles?.full_name ?? 'Unassigned'}
              {t.due_date ? ` · due ${t.due_date}` : ' · no due date'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  newBtn: {
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  form: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 10,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: colors.ink,
  },
  multi: { minHeight: 80 },
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
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700' },
  generateBtn: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  generateText: { color: colors.accent, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: 14, color: colors.muted },
});
