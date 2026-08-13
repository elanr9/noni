// One week's detail. Next week is the planning entry: an empty state until
// week setup stamps the grid, then lanes, split chips and the stamped rows.
// Published weeks show the lanes summary plus posts made. Legacy briefs
// (null post_type_id) still open in the old sheet.
import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

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
  LaneSummaryCard,
  PostsMadeList,
} from '../../../components/admin/WeekOverview';
import {
  AdminScreen,
  PushHeader,
  SkeletonCard,
} from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PressableScale } from '../../../components/ui/PressableScale';
import { formatMetric } from '../../../lib/analytics';
import {
  briefRowState,
  briefWeekRangeLabel,
  briefWeekStatus,
  getCampaign,
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
  type Campaign,
  type CampaignBriefItem,
  type WeekPostItem,
} from '../../../lib/briefs-api';
import { supabase } from '../../../lib/supabase';
import { color, type } from '../../../theme/tokens';

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

export default function WeekDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [items, setItems] = useState<CampaignBriefItem[]>([]);
  const [posts, setPosts] = useState<WeekPostItem[] | null>(null);
  const [hashtagBank, setHashtagBank] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lane, setLane] = useState<Lane>('video');
  const [legacyItem, setLegacyItem] = useState<CampaignBriefItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [targetsVisible, setTargetsVisible] = useState(false);
  const [targetsSaving, setTargetsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const latest = await getCampaign(id);
      setCampaign(latest);
      if (!latest) return;
      const [campaignItems, { data: brand }, all] = await Promise.all([
        listCampaignBriefs(latest.id),
        supabase.from('brand_profiles').select('hashtag_bank').maybeSingle(),
        listCampaigns(),
      ]);
      setItems(campaignItems);
      setHashtagBank(brand?.hashtag_bank ?? []);
      const asc = [...all].sort((a, b) =>
        (a.drop_date ?? '') < (b.drop_date ?? '') ? -1 : 1,
      );
      const idx = asc.findIndex((c) => c.id === latest.id);
      setWeekNumber(idx >= 0 ? idx + 1 : asc.length + 1);
      if (latest.status === 'published') {
        setPosts(await listWeekPosts(latest.id));
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

  const published = campaign?.status === 'published';
  const editable = campaign?.status === 'draft';
  const hasStampedPosts = items.some((i) => i.briefs.post_type_id !== null);
  const needsWeekSetup = editable && !hasStampedPosts;
  const { status, dayOfWeek } = campaign
    ? briefWeekStatus(campaign)
    : { status: 'next' as const, dayOfWeek: null };

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
      ? `${briefWeekRangeLabel(campaign.drop_date)}${metaSuffix}`
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
        ) : published ? (
          <View style={styles.stack}>
            <View style={styles.lanesRow}>
              <LaneSummaryCard
                icon="video"
                label="Videos"
                done={doneCount(videoRows)}
                target={videoTarget}
              />
              <LaneSummaryCard
                icon="images"
                label="Slideshows"
                done={doneCount(slideshowRows)}
                target={slideshowTarget}
              />
            </View>
            <PostsMadeList
              posts={posts ?? []}
              loading={posts === null}
              formatViews={formatMetric}
            />
          </View>
        ) : (
          <View style={styles.stack}>
            <LaneSwitcher
              lane={lane}
              video={{ done: doneCount(videoRows), target: videoTarget }}
              slideshow={{
                done: doneCount(slideshowRows),
                target: slideshowTarget,
              }}
              onChange={setLane}
            />
            <View style={styles.targetsRow}>
              <PressableScale
                accessibilityRole="button"
                onPress={() => setTargetsVisible(true)}
              >
                <Text style={styles.targetsEdit}>Edit targets</Text>
              </PressableScale>
            </View>
            <SplitHeader chips={splitChips} />
            <View style={styles.rows}>
              {activeRows.map((row, i) => (
                <BriefRow
                  key={row.item.brief_id}
                  index={i + 1}
                  brief={row.item.briefs}
                  state={row.state}
                  onPress={() => openRow(row.item)}
                />
              ))}
              {activeRows.length === 0 ? (
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
  lanesRow: {
    flexDirection: 'row',
    gap: 10,
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
