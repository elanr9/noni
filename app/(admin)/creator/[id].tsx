import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';

import { PostGridTile } from '../../../components/admin/creator/PostGridTile';
import { ProfileHeader } from '../../../components/admin/creator/ProfileHeader';
import { Segmented, SkeletonCard, SkeletonLine } from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  fetchCreatorDetail,
  latestSubmissionsByAssignment,
  type CreatorDetail,
} from '../../../lib/admin-api';
import { formatMetric } from '../../../lib/analytics';
import { supabase } from '../../../lib/supabase';
import { parseAssignmentMetrics } from '../../../lib/tasks-api';
import { formatCents } from '../../../lib/wallet-api';
import {
  borderWidth,
  color,
  radiusAdmin,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${`${month + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

/** Credential, handles and photo live outside fetchCreatorDetail. */
type ProfileExtras = {
  avatarUri: string | null;
  credential: string | null;
  tiktokHandle: string | null;
  instagramHandle: string | null;
};

async function fetchProfileExtras(
  companyId: string,
  creatorId: string,
): Promise<ProfileExtras> {
  const [{ data: p }, { data: account }] = await Promise.all([
    supabase
      .from('profiles')
      .select('avatar_path, credential_line')
      .eq('company_id', companyId)
      .eq('id', creatorId)
      .maybeSingle(),
    supabase
      .from('creator_accounts')
      .select('tiktok_handle, instagram_handle')
      .eq('company_id', companyId)
      .eq('creator_id', creatorId)
      .maybeSingle(),
  ]);

  let avatarUri: string | null = null;
  if (p?.avatar_path) {
    const { data: signed } = await supabase.storage
      .from('avatars')
      .createSignedUrl(p.avatar_path, 3600);
    avatarUri = signed?.signedUrl ?? null;
  }

  return {
    avatarUri,
    credential: p?.credential_line ?? null,
    tiktokHandle: account?.tiktok_handle ?? null,
    instagramHandle: account?.instagram_handle ?? null,
  };
}

export default function AdminCreatorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { width: winWidth } = useWindowDimensions();
  const [data, setData] = useState<CreatorDetail | null>(null);
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const [videoPaths, setVideoPaths] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState(0);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || !id) return;
    try {
      const detail = await fetchCreatorDetail(profile.company_id, id);
      const subs = await latestSubmissionsByAssignment(
        detail.assignments.map((a) => a.id),
      );
      const paths = new Map<string, string>();
      for (const [assignmentId, sub] of subs) {
        paths.set(assignmentId, sub.video_path);
      }
      setData(detail);
      setVideoPaths(paths);
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    void fetchProfileExtras(profile.company_id, id)
      .then(setExtras)
      .catch(() => undefined);
  }, [profile, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const assignments = data?.assignments ?? [];
  const earnedCents = (data?.ledger ?? [])
    .filter((entry) => entry.amountCents > 0)
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const views = assignments.reduce(
    (sum, a) => sum + (parseAssignmentMetrics(a.metrics).views ?? 0),
    0,
  );
  const postedCount = assignments.filter((a) => a.status === 'posted').length;

  const byDay = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const key = a.scheduled_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [assignments]);

  const tileSize = Math.floor((winWidth - space.gutterAdmin * 2 - 8 * 2) / 3);

  const openPost = (assignmentId: string) =>
    router.push(`/(admin)/creator/post/${assignmentId}`);

  const weeks = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstWeekday = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const cells: Array<{ day: number; key: string } | null> = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_v, i) => ({
        day: i + 1,
        key: dateKey(year, m, i + 1),
      })),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const selectedPosts = selectedDay !== null ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <>
      <Stack.Screen
        options={{
          title: data?.name ?? 'Creator',
          headerRight: () => (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Message creator"
              onPress={() => router.push(`/(admin)/chat/${id}`)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="message-circle" size={22} color={color.ink} />
            </PressableScale>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
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
        {loading || !data ? (
          <>
            <View style={styles.skeletonHead}>
              <SkeletonCard height={64} radius={32} style={styles.skeletonAvatar} />
              <SkeletonLine height={40} style={styles.skeletonStats} />
            </View>
            <SkeletonCard height={tileSize * 1.4} radius={radiusAdmin.md} />
          </>
        ) : (
          <>
            <ProfileHeader
              name={data.name}
              avatarUri={extras?.avatarUri ?? null}
              credential={extras?.credential ?? null}
              tiktokHandle={extras?.tiktokHandle ?? null}
              instagramHandle={extras?.instagramHandle ?? null}
              earned={formatCents(earnedCents)}
              posts={`${postedCount}`}
              views={formatMetric(views)}
            />

            <Segmented
              options={[{ label: 'Grid' }, { label: 'Calendar' }]}
              value={view}
              onChange={setView}
            />

            {assignments.length === 0 ? (
              <EmptyState
                icon="layout-list"
                title="No posts yet"
                body="Posts show up here as this creator's week fills in."
                compact
              />
            ) : view === 0 ? (
              <View style={styles.grid}>
                {assignments.map((a) => (
                  <PostGridTile
                    key={a.id}
                    title={a.briefs.title}
                    format={
                      a.briefs.format === 'photo_carousel' ? 'photo_carousel' : 'video'
                    }
                    videoPath={videoPaths.get(a.id) ?? null}
                    size={tileSize}
                    viewsLabel={formatMetric(
                      parseAssignmentMetrics(a.metrics).views ?? 0,
                    )}
                    onPress={() => openPost(a.id)}
                  />
                ))}
              </View>
            ) : (
              <>
                <View style={[styles.calendar, shadow.shadowCard]}>
                  <View style={styles.monthRow}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="Previous month"
                      onPress={() => {
                        setSelectedDay(null);
                        setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="chevron-left" size={20} color={color.ink} />
                    </PressableScale>
                    <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="Next month"
                      onPress={() => {
                        setSelectedDay(null);
                        setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="chevron-right" size={20} color={color.ink} />
                    </PressableScale>
                  </View>
                  <View style={styles.weekRow}>
                    {DAY_LABELS.map((d, i) => (
                      <Text key={`${d}-${i}`} style={styles.dayLabel}>
                        {d}
                      </Text>
                    ))}
                  </View>
                  {weeks.map((week, wi) => (
                    <View key={wi} style={styles.weekRow}>
                      {week.map((cell, ci) => {
                        if (cell === null) return <View key={ci} style={styles.dayCell} />;
                        const count = byDay.get(cell.key)?.length ?? 0;
                        const selected = cell.key === selectedDay;
                        return (
                          <PressableScale
                            key={ci}
                            accessibilityRole="button"
                            disabled={count === 0}
                            onPress={() => setSelectedDay(cell.key)}
                            style={[
                              styles.dayCell,
                              count > 0 && styles.dayCellActive,
                              selected && styles.dayCellSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayNumber,
                                count === 0 && styles.dayNumberMuted,
                                selected && styles.dayNumberSelected,
                              ]}
                            >
                              {cell.day}
                            </Text>
                            {count > 0 && (
                              <View
                                style={[styles.dot, selected && styles.dotSelected]}
                              />
                            )}
                          </PressableScale>
                        );
                      })}
                    </View>
                  ))}
                </View>

                {selectedPosts.map((a) => (
                  <PressableScale
                    key={a.id}
                    accessibilityRole="button"
                    onPress={() => openPost(a.id)}
                    style={[styles.dayPost, shadow.shadowCard]}
                  >
                    <Icon
                      name={a.briefs.format === 'video' ? 'play' : 'images'}
                      size={15}
                      color={color.blue600}
                    />
                    <View style={styles.dayPostBody}>
                      <Text style={styles.dayPostTitle} numberOfLines={1}>
                        {a.briefs.title}
                      </Text>
                      <Text style={styles.dayPostMeta}>
                        {a.briefs.format === 'video' ? 'Reel' : 'Slideshow'}
                        {' · '}
                        {formatMetric(parseAssignmentMetrics(a.metrics).views ?? 0)} views
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  content: {
    paddingHorizontal: space.gutterAdmin,
    paddingVertical: 14,
    gap: 14,
  },
  skeletonHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  skeletonAvatar: {
    width: 64,
  },
  skeletonStats: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  calendar: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 12,
    gap: 6,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  monthLabel: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusAdmin.md,
    gap: 2,
  },
  dayCellActive: {
    backgroundColor: color.blue100,
  },
  dayCellSelected: {
    backgroundColor: color.blue500,
  },
  dayNumber: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
  dayNumberMuted: {
    color: color.slate400,
    fontWeight: '500',
  },
  dayNumberSelected: {
    color: color.white,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.blue600,
  },
  dotSelected: {
    backgroundColor: color.white,
  },
  dayPost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  dayPostBody: {
    flex: 1,
    gap: 2,
  },
  dayPostTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  dayPostMeta: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
});
