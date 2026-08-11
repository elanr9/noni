import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';

import { Screen } from '../../../components/layout/Screen';
import { HomeSkeleton, SoftToast } from '../../../components/states';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { MediaCard } from '../../../components/ui/MediaCard';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { fetchMyStreak } from '../../../lib/streaks';
import {
  listMyAssignments,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { color, radius, space, type } from '../../../theme/tokens';

const CLEARED = new Set(['approved', 'posted']);
const HERO_WIDTH = 264;
const HERO_HEIGHT = 470;

function chatSeenKey(creatorId: string): string {
  return `noni.chat.seenAt.${creatorId}`;
}

async function hasUnreadAdminMessage(
  companyId: string,
  creatorId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .neq('author_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const seenAt = await AsyncStorage.getItem(chatSeenKey(creatorId));
  if (seenAt === null) return true;
  return new Date(data.created_at).getTime() > new Date(seenAt).getTime();
}

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function dueLabel(scheduledDate: string): string {
  const today = dayKey(new Date());
  if (scheduledDate === today) return 'Due today';
  const d = new Date(`${scheduledDate}T12:00:00`);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  return `Due ${days[d.getDay()]}`;
}

async function fetchPostTypeLabel(
  postTypeId: string | null,
): Promise<string | undefined> {
  if (postTypeId === null) return undefined;
  const { data, error } = await supabase
    .from('post_types')
    .select('label')
    .eq('id', postTypeId)
    .maybeSingle();
  if (error || data === null) return undefined;
  return data.label;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);
  const [unreadAdmin, setUnreadAdmin] = useState(false);
  const [contentTypeTag, setContentTypeTag] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [next, streakRow, unread] = await Promise.all([
        listMyAssignments(profile.id),
        profile.company_id
          ? fetchMyStreak(profile.company_id, profile.id).catch(() => null)
          : Promise.resolve(null),
        profile.company_id
          ? hasUnreadAdminMessage(profile.company_id, profile.id).catch(
              () => false,
            )
          : Promise.resolve(false),
      ]);
      setAssignments(next);
      setStreak(streakRow?.current_streak ?? 0);
      setUnreadAdmin(unread);

      const today = dayKey(new Date());
      const hero = next.find(
        (a) => a.scheduled_date === today && !CLEARED.has(a.status),
      );
      if (hero !== undefined) {
        setContentTypeTag(await fetchPostTypeLabel(hero.briefs.post_type_id));
      } else {
        setContentTypeTag(undefined);
      }
    } catch {
      setToast('Could not refresh Home. Pull to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const todayKey = dayKey(new Date());
  const today = useMemo(
    () => assignments.filter((a) => a.scheduled_date === todayKey),
    [assignments, todayKey],
  );
  const hero = today.find((a) => !CLEARED.has(a.status));
  const allClear = today.length > 0 && hero === undefined;
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  const hasRevisions = useMemo(
    () => assignments.some((a) => a.status === 'changes_requested'),
    [assignments],
  );
  const showBellDot = hasRevisions || unreadAdmin;

  const openChat = () => {
    if (profile?.id) {
      void AsyncStorage.setItem(
        chatSeenKey(profile.id),
        new Date().toISOString(),
      ).catch(() => undefined);
    }
    setUnreadAdmin(false);
    router.push('/(creator)/chat');
  };

  const openPost = (a: AssignmentWithBrief) => {
    router.push({
      pathname: '/(creator)/post/[id]',
      params: { id: a.id },
    });
  };

  if (loading && assignments.length === 0) {
    return <HomeSkeleton />;
  }

  const format =
    hero?.briefs.format === 'photo_carousel' ? 'slideshow' : 'reel';

  return (
    <Screen
      bg={color.white}
      contentStyle={styles.screenBody}
      footer={
        hero !== undefined ? (
          <View style={styles.footerPad}>
            <Button
              block
              size="lg"
              icon="eye"
              onPress={() => openPost(hero)}
            >
              View post
            </Button>
          </View>
        ) : undefined
      }
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
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
        <View style={styles.headerRow}>
          <Text style={styles.greeting} numberOfLines={2}>
            Hey {firstName}.
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={
              showBellDot ? 'Open messages, new activity' : 'Open messages'
            }
            onPress={openChat}
            style={styles.bellBtn}
          >
            <Icon name="bell" size={22} color={color.ink} />
            {showBellDot ? <View style={styles.bellDot} /> : null}
          </PressableScale>
        </View>

        <View style={styles.streakPill}>
          <Icon name="zap" size={14} color={color.blue600} />
          <Text style={styles.streakText}>{streak} day streak</Text>
        </View>

        {hero !== undefined ? (
          <>
            <Text style={styles.sectionLabel}>Up next today</Text>
            <View style={styles.heroWrap}>
              <MediaCard
                variant="hero"
                format={format}
                title={hero.briefs.title}
                time={dueLabel(hero.scheduled_date)}
                contentTypeTag={contentTypeTag}
                mediaHeight={HERO_HEIGHT}
                onPress={() => openPost(hero)}
              />
            </View>
          </>
        ) : today.length === 0 ? (
          <EmptyState
            compact
            icon="sparkles"
            title="Nothing queued today"
            body="Open Posts to see what is coming, or pull to refresh."
          />
        ) : allClear ? (
          <EmptyState
            compact
            icon="circle-check-big"
            title="Done for today"
            body="Open Posts to review what is live."
          />
        ) : null}
      </ScrollView>
      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="error"
        onHide={() => setToast(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screenBody: {
    paddingHorizontal: 0,
    flex: 1,
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space[2],
    paddingBottom: space[3],
    gap: space[4],
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[5],
  },
  greeting: {
    flex: 1,
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  bellBtn: {
    width: space.tapMin,
    height: space.tapMin,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.white,
  },
  streakPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  streakText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  sectionLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  heroWrap: {
    width: HERO_WIDTH,
    alignSelf: 'center',
    position: 'relative',
  },
  footerPad: {
    // Floating TabBar (~68) + bottom offset (22)
    paddingBottom: space.tapMin + space[11] + space[2],
  },
});
