// One week's detail. Next week is the planning entry: an empty state until
// week setup stamps the grid, then lanes, type chips and the stamped rows.
// Live weeks keep the grid. Done weeks show the lanes and the posts made.
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import {
  BriefRow,
  type GridRowState,
} from '../../../components/admin/grid/BriefRow';
import {
  LaneSwitcher,
  type Lane,
} from '../../../components/admin/grid/LaneSwitcher';
import {
  SplitHeader,
  type SplitChip,
} from '../../../components/admin/grid/SplitHeader';
import {
  WeekFooter,
  type WeekPhase,
} from '../../../components/admin/grid/WeekFooter';
import {
  AdminScreen,
  MsgButton,
  PushHeader,
  SkeletonCard,
} from '../../../components/admin/shared';
import { PostsMadeList } from '../../../components/admin/WeekOverview';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatMetric } from '../../../lib/analytics';
import {
  briefRowState,
  briefWeekOpensLabel,
  briefWeekRangeLabel,
  briefWeekStatus,
  getCampaign,
  listCampaignBriefs,
  listCampaigns,
  listWeekPosts,
  type Campaign,
  type CampaignBriefItem,
  type WeekPostItem,
} from '../../../lib/briefs-api';
import { unreadManagerMessageCount } from '../../../lib/manager-messages-api';
import { color, radiusAdmin, type } from '../../../theme/tokens';

function mondayOf(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatViews(n: number): string {
  return formatMetric(Math.round(n)).replace(/k/g, 'K');
}

/**
 * True before Sunday 8:00 PM in New York of the drop week, the notify
 * cutoff publish-campaign schedules against.
 */
function isBeforeNotifyCutoff(dropDate: string): boolean {
  const sundayIso = isoDate(addDays(mondayOf(dropDate), 6));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (unit: string): string =>
    parts.find((p) => p.type === unit)?.value ?? '00';
  const nyDate = `${get('year')}-${get('month')}-${get('day')}`;
  if (nyDate !== sundayIso) return nyDate < sundayIso;
  return Number(get('hour')) < 20;
}

function familyOf(item: CampaignBriefItem): Lane {
  const raw = item.briefs.post_types?.family ?? item.briefs.format;
  return raw === 'photo_carousel' ? 'photo_carousel' : 'video';
}

function rowStateOf(item: CampaignBriefItem): GridRowState {
  const state = briefRowState(item.briefs, item.briefs.post_types);
  if (state === 'empty' && item.briefs.kill_reason) return 'killed';
  return state;
}

function isRowDone(state: GridRowState): boolean {
  return state === 'complete' || state === 'killed';
}

export default function WeekDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [items, setItems] = useState<CampaignBriefItem[]>([]);
  const [posts, setPosts] = useState<WeekPostItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lane, setLane] = useState<Lane>('video');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const latest = await getCampaign(id);
      setCampaign(latest);
      if (!latest) return;
      const weekStatus = briefWeekStatus(latest).status;
      const [campaignItems, all, weekPosts, nextUnread] = await Promise.all([
        listCampaignBriefs(latest.id),
        listCampaigns(),
        weekStatus === 'done' ? listWeekPosts(latest.id) : Promise.resolve(null),
        unreadManagerMessageCount().catch(() => 0),
      ]);
      setItems(campaignItems);
      setUnread(nextUnread);
      const asc = [...all].sort((a, b) =>
        (a.drop_date ?? '') < (b.drop_date ?? '') ? -1 : 1,
      );
      const idx = asc.findIndex((c) => c.id === latest.id);
      setWeekNumber(idx >= 0 ? idx + 1 : asc.length + 1);
      setPosts(weekPosts);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const editable = campaign?.status === 'draft';
  const published = campaign?.status === 'published';
  const needsWeekSetup = editable && items.length === 0;
  const { status, dayOfWeek } = campaign
    ? briefWeekStatus(campaign)
    : { status: 'next' as const, dayOfWeek: null };
  const isDone = status === 'done';

  const rows = useMemo(
    () =>
      items.map((item) => ({
        item,
        family: familyOf(item),
        state: rowStateOf(item),
      })),
    [items],
  );

  const videoRows = rows.filter((r) => r.family === 'video');
  const slideshowRows = rows.filter((r) => r.family === 'photo_carousel');
  const doneCount = (list: typeof rows) =>
    list.filter((r) => isRowDone(r.state)).length;
  const activeRows = lane === 'video' ? videoRows : slideshowRows;
  const visibleRows = typeFilter
    ? activeRows.filter((r) => r.item.briefs.post_types?.key === typeFilter)
    : activeRows;

  const splitChips = useMemo<SplitChip[]>(() => {
    const labels = new Map<string, string>();
    for (const row of activeRows) {
      const t = row.item.briefs.post_types;
      if (t && !labels.has(t.key)) labels.set(t.key, t.label);
    }
    return [...labels.entries()].map(([key, label]) => ({ key, label }));
  }, [activeRows]);
  const typedRows = activeRows.flatMap((r) => {
    const key = r.item.briefs.post_types?.key;
    return key ? [{ key, state: r.state }] : [];
  });

  const leftCount = rows.filter((r) => !isRowDone(r.state)).length;
  const phase: WeekPhase = published
    ? 'published'
    : leftCount === 0
      ? 'complete'
      : 'in_progress';
  const showFooter = published || (editable && rows.length > 0 && phase === 'complete');
  const madeCount = rows.length - leftCount;
  const videoTarget = campaign?.video_target ?? 20;
  const slideshowTarget = campaign?.slideshow_target ?? 10;

  const metaSuffix =
    status === 'next'
      ? campaign?.drop_date != null
        ? ` · ${briefWeekOpensLabel(campaign.drop_date)}`
        : ''
      : status === 'current' && dayOfWeek !== null
        ? ` · day ${dayOfWeek} of 7`
        : ' · done';
  const subtitle =
    campaign?.drop_date != null
      ? `${briefWeekRangeLabel(campaign.drop_date)}${metaSuffix}`
      : undefined;

  function openRow(item: CampaignBriefItem) {
    router.push(`/(admin)/post/${item.brief_id}`);
  }

  /** Publish opens the day planner: pick or randomize the days. */
  function openPlanner() {
    if (!campaign) return;
    router.push({
      pathname: '/(admin)/week-plan',
      params: { id: campaign.id },
    } as Href);
  }

  const laneSwitcher = (disabled: boolean) => (
    <LaneSwitcher
      lane={lane}
      video={{ done: doneCount(videoRows), target: videoTarget }}
      slideshow={{ done: doneCount(slideshowRows), target: slideshowTarget }}
      disabled={disabled}
      onChange={(next) => {
        setLane(next);
        setTypeFilter(null);
      }}
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Week' }} />
      <AdminScreen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        actionBar={
          showFooter ? (
            <WeekFooter
              phase={phase}
              left={leftCount}
              weekNumber={weekNumber ?? 1}
              beforeCutoff={
                campaign?.drop_date
                  ? isBeforeNotifyCutoff(campaign.drop_date)
                  : true
              }
              publishing={false}
              onPublish={openPlanner}
              onStartNext={() => router.push('/(admin)/week-setup')}
              onPlanMore={published && !isDone ? openPlanner : undefined}
            />
          ) : undefined
        }
      >
        <PushHeader
          title={weekNumber !== null ? `Week ${weekNumber}` : (campaign?.name ?? 'Week')}
          subtitle={subtitle}
          onBack={() => router.back()}
          trailing={
            <MsgButton
              count={unread}
              onPress={() => router.push('/(admin)/messages' as Href)}
            />
          }
        />

        {loading ? (
          <View style={styles.stack}>
            <SkeletonCard height={78} />
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
          </View>
        ) : campaign === null ? (
          <Text style={styles.notFound}>Week not found</Text>
        ) : needsWeekSetup ? (
          <EmptyState
            icon="layout-list"
            title="Not planned yet"
            body="Pick videos and slideshows a day and the rows appear."
            actionLabel={
              weekNumber === null ? 'Start week' : `Start week ${weekNumber}`
            }
            onAction={() => router.push('/(admin)/week-setup')}
            style={styles.empty}
          />
        ) : isDone ? (
          <View style={styles.stack}>
            {laneSwitcher(true)}
            <PostsMadeList
              posts={posts ?? []}
              loading={posts === null}
              formatViews={formatViews}
            />
          </View>
        ) : (
          <View style={styles.stack}>
            {!published && rows.length > 0 ? (
              <View style={styles.madeTagRow}>
                <View style={styles.madeTag}>
                  <Text style={styles.madeTagText}>{`${madeCount}/${rows.length} posts made`}</Text>
                </View>
              </View>
            ) : null}
            {laneSwitcher(false)}
            <SplitHeader
              split={splitChips}
              rows={typedRows}
              active={typeFilter}
              onSelect={setTypeFilter}
            />
            <View style={styles.rows}>
              {visibleRows.map((row, i) => (
                <BriefRow
                  key={row.item.brief_id}
                  index={i + 1}
                  brief={row.item.briefs}
                  state={row.state}
                  onPress={() => openRow(row.item)}
                />
              ))}
              {visibleRows.length === 0 ? (
                <Text style={styles.emptyGrid}>No posts on this side yet.</Text>
              ) : null}
            </View>
          </View>
        )}
      </AdminScreen>
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  rows: {
    gap: 10,
  },
  madeTagRow: {
    flexDirection: 'row',
    marginBottom: -4,
  },
  madeTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue50,
  },
  madeTagText: {
    fontSize: type.size.micro11,
    fontWeight: '700',
    color: color.blue700,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    marginTop: 30,
  },
  notFound: {
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  emptyGrid: {
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
});
