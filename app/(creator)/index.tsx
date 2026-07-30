import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useFocusEffect, useRouter, type Href } from 'expo-router';

import { BrandTitle, LoadingScreen, Screen, colors } from '../../components/Screen';
import { TaskCard } from '../../components/TaskCard';
import { useAuth } from '../../lib/auth';
import { listMyTasks, type TaskWithTrend } from '../../lib/tasks-api';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDue(due: string | null): Date | null {
  if (!due) return null;
  const d = new Date(`${due}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function TodayScreen() {
  const { profile, signOut } = useAuth();
  const [tasks, setTasks] = useState<TaskWithTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setError(null);
    try {
      setTasks(await listMyTasks(profile.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks');
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

  if (loading) return <LoadingScreen label="Loading Today" />;

  const today = startOfToday();
  const weekEnd = endOfWeek(today);
  const openStatuses = new Set(['assigned', 'recorded', 'changes_requested']);

  const dueToday = tasks.filter((t) => {
    const due = parseDue(t.due_date);
    return due && due >= today && due < new Date(today.getTime() + 86400000);
  });
  const dueThisWeek = tasks.filter((t) => {
    const due = parseDue(t.due_date);
    if (!due) return false;
    const isToday = due >= today && due < new Date(today.getTime() + 86400000);
    return !isToday && due >= today && due <= weekEnd;
  });
  const owed = tasks.filter((t) => openStatuses.has(t.status)).length;

  return (
    <Screen style={styles.screen}>
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
        <View style={styles.padded}>
          <BrandTitle
            title="Today"
            subtitle={`Hey ${profile?.full_name ?? 'creator'}. Shoot what you owe, video or static.`}
          />
        </View>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{owed}</Text>
            <Text style={styles.statLabel}>owed</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{dueToday.length}</Text>
            <Text style={styles.statLabel}>due today</Text>
          </View>
        </View>

        <View style={styles.navRow}>
          <Link href="/(creator)/my-posts" asChild>
            <Pressable style={styles.navBtn}>
              <Text style={styles.navText}>My posts</Text>
            </Pressable>
          </Link>
          <Link href={'/(creator)/settings' as Href} asChild>
            <Pressable style={styles.navBtn}>
              <Text style={styles.navText}>Settings</Text>
            </Pressable>
          </Link>
          <Pressable style={styles.ghost} onPress={() => void signOut()}>
            <Text style={styles.ghostText}>Sign out</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.padded}>
          <Section title="Due today" tasks={dueToday} empty="Nothing due today. Clear this week next." />
          <Section
            title="This week"
            tasks={dueThisWeek}
            empty="No other tasks this week."
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  tasks,
  empty,
}: {
  title: string;
  tasks: TaskWithTrend[];
  empty: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {tasks.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onPress={() => router.push(`/(creator)/task/${task.id}`)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  padded: { paddingHorizontal: 24 },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  stat: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E6E2DA',
  },
  statNum: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -1,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 15,
    color: colors.muted,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  navBtn: {
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  navText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ghost: { padding: 8 },
  ghostText: { color: colors.muted, fontWeight: '600' },
  error: {
    color: '#C1121F',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 28,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  empty: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 21,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 10,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  cardMeta: {
    fontSize: 14,
    color: colors.muted,
  },
});
