// One week's detail. Next week is the planning entry: an empty state until
// week setup stamps the grid, then lanes, split chips and the stamped rows.
// Live weeks keep the grid. Done weeks open the past-brief archive.
import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import {
  BriefEditSheet,
  type BriefEditValues,
} from '../../../components/admin/BriefEditSheet';
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
import { WeekTargetsSheet } from '../../../components/admin/grid/WeekTargetsSheet';
import {
  AdminScreen,
  Card,
  MsgButton,
  PushHeader,
  Segmented,
  SkeletonCard,
  Thumb,
} from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PressableScale } from '../../../components/ui/PressableScale';
import { formatMetric } from '../../../lib/analytics';
import { useAuth } from '../../../lib/auth';
import {
  briefRowState,
  briefWeekRangeLabel,
  briefWeekStatus,
  getCampaign,
  listBriefWeeks,
  listCampaignBriefs,
  listCampaigns,
  listWeekPosts,
  parseHookOptions,
  parseTalkingPoints,
  publishCampaign,
  removeBriefFromCampaign,
  updateBrief,
  updateCampaignTargets,
  type BriefFormat,
  type BriefWeekStats,
  type Campaign,
  type CampaignBriefItem,
  type WeekPostItem,
} from '../../../lib/briefs-api';
import { unreadManagerMessageCount } from '../../../lib/manager-messages-api';
import { supabase } from '../../../lib/supabase';
import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';

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

function formatSales(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function formatLabel(format: BriefFormat): string {
  return format === 'photo_carousel' ? 'Slideshow' : 'Reel';
}

function postedDayMeta(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} ${d.getDate()}`;
}

/**
 * True before Sunday 8:00 PM in New York of the drop week — the notify
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

function padHooks(options: string[]): string[] {
  return [options[0] ?? '', options[1] ?? ''];
}

function PastWeekBody({
  campaignId,
  dropDate,
  posts,
  stats,
  showSales,
}: {
  campaignId: string;
  dropDate: string;
  posts: WeekPostItem[] | null;
  stats: BriefWeekStats | null;
  showSales: boolean;
}) {
  const [fmt, setFmt] = useState(0);
  const list = posts ?? [];
  const viewsPerDay =
    stats?.viewsPerDay ?? list.reduce((sum, p) => sum + p.views, 0) / 7;
  const salesCents =
    stats?.salesCents ?? list.reduce((sum, p) => sum + p.salesCents, 0);
  const postCount = stats?.posts ?? list.length;
  const filtered =
    fmt === 0
      ? list
      : list.filter((p) =>
          fmt === 1 ? p.format === 'video' : p.format === 'photo_carousel',
        );
  const monday = mondayOf(dropDate);
  const counts = new Map<string, number>();
  for (const p of list) {
    counts.set(p.postedDay, (counts.get(p.postedDay) ?? 0) + 1);
  }
  const statCards: { label: string; value: string; money?: boolean }[] = [
    { label: 'Views/day', value: formatViews(viewsPerDay) },
  ];
  if (showSales) {
    statCards.push({ label: 'Sales', value: formatSales(salesCents), money: true });
  }
  statCards.push({ label: 'Posts', value: String(postCount) });

  return (
    <View style={styles.pastStack}>
      <View style={styles.statRow}>
        {statCards.map((s) => (
          <Card key={s.label} pad={12} style={styles.statCard}>
            <Text style={[styles.statValue, s.money ? styles.statMoney : null]}>
              {s.value}
            </Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </Card>
        ))}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayRow}
      >
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(monday, i);
          const iso = isoDate(d);
          const n = counts.get(iso) ?? 0;
          return (
            <PressableScale
              key={iso}
              accessibilityRole="button"
              accessibilityLabel={`${d.toLocaleDateString(undefined, { weekday: 'long' })}, ${n} posts`}
              onPress={() =>
                router.push({
                  pathname: '/(admin)/week-day',
                  params: { id: campaignId, date: iso },
                })
              }
              style={[styles.dayChip, shadow.shadowCard]}
            >
              <Text style={styles.dayWeekday}>
                {d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
              </Text>
              <Text style={styles.dayNum}>{d.getDate()}</Text>
              <Text style={styles.dayCount}>{`${n} posts`}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <Segmented
        options={[
          { label: 'All' },
          { label: 'Videos' },
          { label: 'Slideshows' },
        ]}
        value={fmt}
        onChange={setFmt}
      />
      <View style={styles.pastPosts}>
        {filtered.map((p) => (
          <Card key={p.postId} pad={12} style={styles.pastRow}>
            <Thumb format={p.format} width={38} height={50} radius={9} />
            <View style={styles.pastBody}>
              <Text numberOfLines={1} style={styles.pastTitle}>
                {p.title}
              </Text>
              <Text numberOfLines={1} style={styles.pastMeta}>
                {`${p.creatorName} · ${formatLabel(p.format)} · ${postedDayMeta(p.postedDay)}`}
              </Text>
            </View>
            <View style={styles.pastMetrics}>
              <Text style={styles.pastViews}>{formatViews(p.views)}</Text>
              {showSales ? (
                <Text style={styles.pastSales}>{formatSales(p.salesCents)}</Text>
              ) : null}
            </View>
          </Card>
        ))}
      </View>
      {showSales ? (
        <Text style={styles.footnote}>
          Sales show because sales tracking is on in Settings.
        </Text>
      ) : null}
    </View>
  );
}

export default function WeekDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { managerAccess } = useAuth();
  const showSales = managerAccess.viewFinancials;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [items, setItems] = useState<CampaignBriefItem[]>([]);
  const [posts, setPosts] = useState<WeekPostItem[] | null>(null);
  const [stats, setStats] = useState<BriefWeekStats | null>(null);
  const [hashtagBank, setHashtagBank] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lane, setLane] = useState<Lane>('video');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [legacyItem, setLegacyItem] = useState<CampaignBriefItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [targetsVisible, setTargetsVisible] = useState(false);
  const [targetsSaving, setTargetsSaving] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const latest = await getCampaign(id);
      setCampaign(latest);
      if (!latest) return;
      const weekStatus = briefWeekStatus(latest).status;
      const [campaignItems, { data: brand }, all, doneData, nextUnread] = await Promise.all([
        listCampaignBriefs(latest.id),
        supabase.from('brand_profiles').select('hashtag_bank').maybeSingle(),
        listCampaigns(),
        weekStatus === 'done'
          ? Promise.all([listWeekPosts(latest.id), listBriefWeeks()])
          : Promise.resolve(null),
        unreadManagerMessageCount().catch(() => 0),
      ]);
      setItems(campaignItems);
      setHashtagBank(brand?.hashtag_bank ?? []);
      setUnread(nextUnread);
      const asc = [...all].sort((a, b) =>
        (a.drop_date ?? '') < (b.drop_date ?? '') ? -1 : 1,
      );
      const idx = asc.findIndex((c) => c.id === latest.id);
      setWeekNumber(idx >= 0 ? idx + 1 : asc.length + 1);
      if (doneData) {
        const [weekPosts, weeks] = doneData;
        setPosts(weekPosts);
        setStats(weeks.find((w) => w.campaign.id === latest.id)?.stats ?? null);
      } else {
        setPosts(null);
        setStats(null);
      }
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
  const hasStampedPosts = items.some((i) => i.briefs.post_type_id !== null);
  const needsWeekSetup = editable && !hasStampedPosts;
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
    list.filter(
      (r) =>
        r.state === 'filled' || r.state === 'complete' || r.state === 'killed',
    ).length;
  const activeRows = lane === 'video' ? videoRows : slideshowRows;
  const visibleRows = typeFilter
    ? activeRows.filter((r) => r.item.briefs.post_types?.key === typeFilter)
    : activeRows;

  const typeSplit = useMemo(
    () =>
      campaign && campaign.type_split && typeof campaign.type_split === 'object'
        ? (campaign.type_split as Record<string, number>)
        : {},
    [campaign],
  );
  const splitChips = useMemo<SplitChip[]>(() => {
    const counts = new Map<string, { label: string; actual: number }>();
    for (const row of rows) {
      const t = row.item.briefs.post_types;
      if (!t || t.family !== lane) continue;
      const entry = counts.get(t.key) ?? { label: t.label, actual: 0 };
      entry.actual += 1;
      counts.set(t.key, entry);
    }
    for (const [key, planned] of Object.entries(typeSplit)) {
      if (planned > 0 && !counts.has(key)) {
        const anyRow = items.find((i) => i.briefs.post_types?.key === key);
        if (anyRow?.briefs.post_types?.family === lane) {
          counts.set(key, { label: anyRow.briefs.post_types.label, actual: 0 });
        }
      }
    }
    return [...counts.entries()].map(([key, entry]) => ({
      key,
      label: entry.label,
      actual: entry.actual,
      planned: typeSplit[key] ?? 0,
    }));
  }, [rows, typeSplit, lane, items]);

  const leftCount = rows.filter(
    (r) => r.state !== 'complete' && r.state !== 'killed',
  ).length;
  const phase: WeekPhase =
    rows.length > 0 && leftCount === 0 ? 'complete' : 'in_progress';
  const videoTarget = campaign?.video_target ?? 20;
  const slideshowTarget = campaign?.slideshow_target ?? 10;

  const metaSuffix =
    status === 'next'
      ? ' · opens Sunday'
      : status === 'current' && dayOfWeek !== null
        ? ` · day ${dayOfWeek} of 7`
        : ' · done';
  const subtitle =
    campaign?.drop_date != null
      ? isDone
        ? `${briefWeekRangeLabel(campaign.drop_date)} · complete`
        : `${briefWeekRangeLabel(campaign.drop_date)}${metaSuffix}`
      : undefined;

  function openRow(item: CampaignBriefItem) {
    if (item.briefs.post_type_id === null) {
      setLegacyItem(item);
      return;
    }
    router.push(`/(admin)/post/${item.brief_id}`);
  }

  const legacyValues = useMemo<BriefEditValues>(() => {
    const b = legacyItem?.briefs;
    if (!b) {
      return {
        title: '',
        format: 'video',
        hook: '',
        hookOptions: ['', ''],
        chosenHookIndex: 0,
        talkingPoints: [],
        hashtags: [],
        searchQuery: '',
        script: '',
        caption: '',
        whyItWorks: '',
        targetWords: 380,
      };
    }
    const points = parseTalkingPoints(b.talking_points);
    const options = parseHookOptions(b.hook_options);
    const legacy = points.length === 0 && Boolean(b.script?.trim());
    const hookOptions = padHooks(options);
    const chosenIndex = b.hook ? hookOptions.indexOf(b.hook) : 0;
    return {
      title: b.title,
      format: (b.format === 'photo_carousel'
        ? 'photo_carousel'
        : 'video') as BriefFormat,
      hook: legacy ? (b.hook ?? '') : '',
      hookOptions,
      chosenHookIndex: chosenIndex >= 0 ? chosenIndex : 0,
      talkingPoints: points,
      hashtags: b.hashtags,
      searchQuery: b.search_phrase ?? '',
      script: b.script ?? '',
      caption: b.caption ?? '',
      whyItWorks: b.why_it_works ?? '',
      targetWords: b.target_words,
    };
  }, [legacyItem]);

  async function saveLegacy(values: BriefEditValues) {
    if (!legacyItem) return;
    setSaving(true);
    try {
      const legacy =
        values.talkingPoints.length === 0 && values.script.trim().length > 0;
      const chosenHook = legacy
        ? values.hook.trim() || null
        : values.hookOptions[values.chosenHookIndex]?.trim() || null;
      await updateBrief(legacyItem.brief_id, {
        title: values.title,
        format: values.format,
        hook: chosenHook,
        hook_options: legacy ? [] : values.hookOptions,
        talking_points: values.talkingPoints,
        hashtags: values.hashtags,
        search_phrase: values.searchQuery.trim() || null,
        point_count: legacy ? null : values.talkingPoints.length,
        target_words: values.targetWords,
        script: values.script || null,
        caption: values.caption || null,
        why_it_works: values.whyItWorks || null,
      });
      setLegacyItem(null);
      await load();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  }

  async function removeLegacyFromCampaign() {
    if (!campaign || !legacyItem) return;
    try {
      await removeBriefFromCampaign(campaign.id, legacyItem.brief_id);
      setLegacyItem(null);
      await load();
    } catch (e) {
      Alert.alert('Remove failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  async function saveTargets(video: number, slideshow: number) {
    if (!campaign) return;
    setTargetsSaving(true);
    try {
      await updateCampaignTargets(campaign.id, {
        video_target: video,
        slideshow_target: slideshow,
      });
      setTargetsVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setTargetsSaving(false);
    }
  }

  function confirmPublish() {
    if (!campaign) return;
    Alert.alert(
      'Publish to creators?',
      `Every creator gets their week from these ${items.length} posts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => void publish() },
      ],
    );
  }

  async function publish() {
    if (!campaign) return;
    setPublishing(true);
    try {
      const result = await publishCampaign(campaign.id);
      Alert.alert(
        result.scheduled ? 'Campaign scheduled' : 'Campaign is live',
        result.scheduled
          ? `${result.assignments_written} assignments across ${result.creators} creators. Creators get the push Sunday at 8PM Eastern.`
          : `${result.assignments_written} assignments across ${result.creators} creators. Notifications are on the way.`,
      );
      await load();
    } catch (e) {
      Alert.alert('Publish failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPublishing(false);
    }
  }

  const showFooter = editable && hasStampedPosts && rows.length > 0;

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
              publishing={publishing}
              onPublish={confirmPublish}
              onStartNext={() => router.push('/(admin)/week-setup')}
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
            body="Set the ratio, split the types, and thirty stamped rows appear."
            actionLabel={
              weekNumber === null ? 'Start week' : `Start week ${weekNumber}`
            }
            onAction={() => router.push('/(admin)/week-setup')}
            style={styles.empty}
          />
        ) : isDone && campaign.drop_date ? (
          posts === null ? (
            <View style={styles.stack}>
              <SkeletonCard height={78} />
              <SkeletonCard height={72} />
              <SkeletonCard height={72} />
            </View>
          ) : (
            <PastWeekBody
              campaignId={campaign.id}
              dropDate={campaign.drop_date}
              posts={posts}
              stats={stats}
              showSales={showSales}
            />
          )
        ) : (
          <View style={styles.stack}>
            <LaneSwitcher
              lane={lane}
              video={{ done: doneCount(videoRows), target: videoTarget }}
              slideshow={{
                done: doneCount(slideshowRows),
                target: slideshowTarget,
              }}
              onChange={(next) => {
                setLane(next);
                setTypeFilter(null);
              }}
            />
            {editable ? (
              <View style={styles.targetsRow}>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => setTargetsVisible(true)}
                >
                  <Text style={styles.targetsEdit}>Edit targets</Text>
                </PressableScale>
              </View>
            ) : null}
            <SplitHeader
              split={splitChips}
              rows={activeRows.map((r) => ({
                key: r.item.briefs.post_types?.key ?? '',
                state: r.state,
              }))}
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

      <BriefEditSheet
        visible={legacyItem !== null}
        mode="edit"
        initial={legacyValues}
        hashtagBank={hashtagBank}
        warnings={[]}
        exampleUrl={legacyItem?.briefs.example_url ?? null}
        busy={saving}
        onClose={() => setLegacyItem(null)}
        onSave={(values) => void saveLegacy(values)}
        onRemove={() => void removeLegacyFromCampaign()}
      />

      <WeekTargetsSheet
        visible={targetsVisible}
        videoTarget={videoTarget}
        slideshowTarget={slideshowTarget}
        saving={targetsSaving}
        onClose={() => setTargetsVisible(false)}
        onSave={(v, s) => void saveTargets(v, s)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  pastStack: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  statMoney: {
    color: color.green,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  dayChip: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.white,
  },
  dayWeekday: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: color.slate400,
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  dayCount: {
    fontSize: 10.5,
    fontWeight: '600',
    color: color.blue600,
  },
  pastPosts: {
    gap: 8,
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  pastBody: {
    flex: 1,
    minWidth: 0,
  },
  pastTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  pastMeta: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
  },
  pastMetrics: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  pastViews: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  pastSales: {
    fontSize: 11,
    fontWeight: '700',
    color: color.green,
  },
  footnote: {
    marginHorizontal: 2,
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 12.5 * 1.45,
    color: color.slate400,
  },
  rows: {
    gap: 10,
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
  targetsRow: {
    marginTop: -4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  targetsEdit: {
    fontSize: type.size.meta,
    fontWeight: '700',
    color: color.blue600,
  },
});
