// Briefs tab — the current week's stamped grid (admin handoff §6). One
// week at a time: lanes, split chips, thirty rows, the footer state
// machine, and the calendar view behind the header toggle.
import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { BriefRow, type GridRowState } from '../../../components/admin/grid/BriefRow';
import {
  LaneSwitcher,
  type Lane,
} from '../../../components/admin/grid/LaneSwitcher';
import {
  SplitHeader,
  type SplitChip,
} from '../../../components/admin/grid/SplitHeader';
import {
  ViewToggle,
  type BriefsView,
} from '../../../components/admin/grid/ViewToggle';
import { WeekCalendar } from '../../../components/admin/grid/WeekCalendar';
import { WeekTargetsSheet } from '../../../components/admin/grid/WeekTargetsSheet';
import {
  WeekFooter,
  type WeekPhase,
} from '../../../components/admin/grid/WeekFooter';
import {
  AdminHeader,
  AdminScreen,
  SkeletonCard,
} from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
  listWeekAssignments,
  type AssignmentQueueItem,
} from '../../../lib/admin-api';
import {
  briefRowState,
  listCampaignBriefs,
  listCampaigns,
  publishCampaign,
  updateCampaignTargets,
  type Campaign,
  type CampaignBriefItem,
} from '../../../lib/briefs-api';
import { PressableScale } from '../../../components/ui/PressableScale';
import { color, space, type } from '../../../theme/tokens';

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

/** "Aug 10 to 16", or "Aug 30 to Sep 5" across a month boundary. */
function weekRangeLabel(dropDate: string): string {
  const mon = mondayOf(dropDate);
  const sun = addDays(mon, 6);
  const monMonth = mon.toLocaleDateString(undefined, { month: 'short' });
  if (mon.getMonth() === sun.getMonth()) {
    return `${monMonth} ${mon.getDate()} to ${sun.getDate()}`;
  }
  const sunMonth = sun.toLocaleDateString(undefined, { month: 'short' });
  return `${monMonth} ${mon.getDate()} to ${sunMonth} ${sun.getDate()}`;
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

export default function BriefsScreen() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [items, setItems] = useState<CampaignBriefItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<BriefsView>('grid');
  const [lane, setLane] = useState<Lane>('video');
  const [publishing, setPublishing] = useState(false);
  const [targetsVisible, setTargetsVisible] = useState(false);
  const [targetsSaving, setTargetsSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await listCampaigns();
      setCampaigns(all);
      const latest = all[0] ?? null;
      if (latest) {
        const monday = latest.drop_date ? mondayOf(latest.drop_date) : null;
        const [campaignItems, weekAssignments] = await Promise.all([
          listCampaignBriefs(latest.id),
          monday
            ? listWeekAssignments(isoDate(monday), isoDate(addDays(monday, 6)))
            : Promise.resolve([]),
        ]);
        setItems(campaignItems);
        setAssignments(weekAssignments);
      } else {
        setItems([]);
        setAssignments([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const campaign = campaigns[0] ?? null;
  // Campaigns come back newest first, so the latest is week N of N.
  const weekNumber = campaigns.length;
  const editable = campaign?.status === 'draft';

  const rows = useMemo(
    () =>
      items.map((item) => ({
        item,
        family: familyOf(item),
        state: rowStateOf(item),
      })),
    [items],
  );

  const laneRows = (which: Lane) => rows.filter((r) => r.family === which);
  const doneCount = (list: ReturnType<typeof laneRows>) =>
    list.filter(
      (r) => r.state === 'filled' || r.state === 'complete' || r.state === 'killed',
    ).length;

  const videoRows = laneRows('video');
  const slideshowRows = laneRows('photo_carousel');
  const activeRows = lane === 'video' ? videoRows : slideshowRows;
  const visibleRows = typeFilter
    ? activeRows.filter((r) => r.item.briefs.post_types?.key === typeFilter)
    : activeRows;

  const typeSplit = useMemo(
    () =>
      campaign?.type_split && typeof campaign.type_split === 'object'
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
  const readyCount = rows.filter((r) => r.state === 'complete').length;
  const phase: WeekPhase =
    campaign?.status === 'published'
      ? 'published'
      : rows.length > 0 && leftCount === 0
        ? 'complete'
        : 'in_progress';

  function openRow(item: CampaignBriefItem) {
    if (!campaign) return;
    if (item.briefs.post_type_id === null) {
      // Legacy briefs still edit through the old week screen's sheet.
      router.push(`/(admin)/week/${campaign.id}`);
      return;
    }
    router.push(`/(admin)/post/${item.brief_id}`);
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

  /** Testing mode: publish only the reviewed posts, starting today. */
  function confirmPublishReady() {
    if (!campaign) return;
    const days = Math.ceil(readyCount / 3);
    Alert.alert(
      `Publish ${readyCount} ready ${readyCount === 1 ? 'post' : 'posts'}?`,
      `Creators get a ${days} day plan starting today and are notified right away. The unfinished rows stay behind and never reach creators.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => void publish(true) },
      ],
    );
  }

  async function saveTargets(videoTarget: number, slideshowTarget: number) {
    if (!campaign) return;
    setTargetsSaving(true);
    try {
      await updateCampaignTargets(campaign.id, {
        video_target: videoTarget,
        slideshow_target: slideshowTarget,
      });
      setTargetsVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setTargetsSaving(false);
    }
  }

  async function publish(onlyReady = false) {
    if (!campaign) return;
    setPublishing(true);
    try {
      const result = await publishCampaign(
        campaign.id,
        onlyReady
          ? { onlyReady: true, startDate: isoDate(new Date()) }
          : undefined,
      );
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

  const subtitle =
    campaign?.drop_date != null
      ? `Week ${weekNumber} · ${weekRangeLabel(campaign.drop_date)}`
      : 'A week is one shared pool of posts for the whole roster.';

  const showFooter = campaign !== null && rows.length > 0 && view === 'grid';

  return (
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
            weekNumber={weekNumber}
            beforeCutoff={
              campaign?.drop_date ? isBeforeNotifyCutoff(campaign.drop_date) : true
            }
            publishing={publishing}
            onPublish={confirmPublish}
            readyCount={readyCount}
            onPublishReady={confirmPublishReady}
            onStartNext={() => router.push('/(admin)/week-setup')}
          />
        ) : undefined
      }
    >
      <AdminHeader
        title="Briefs"
        subtitle={subtitle}
        trailing={
          campaign !== null ? <ViewToggle view={view} onChange={setView} /> : undefined
        }
      />

      {loading ? (
        <View style={styles.stack}>
          <SkeletonCard height={92} />
          <SkeletonCard height={92} />
          <SkeletonCard height={92} />
        </View>
      ) : campaign === null ? (
        <EmptyState
          icon="layout-list"
          title="No week yet"
          body="Set the ratio, split the types, and thirty stamped rows appear."
          actionLabel="Start week"
          onAction={() => router.push('/(admin)/week-setup')}
          style={styles.empty}
        />
      ) : view === 'calendar' ? (
        <WeekCalendar
          weekStart={campaign.drop_date ? mondayOf(campaign.drop_date) : new Date()}
          assignments={assignments}
        />
      ) : (
        <View style={styles.stack}>
          <LaneSwitcher
            lane={lane}
            video={{
              done: doneCount(videoRows),
              target: campaign.video_target ?? 20,
            }}
            slideshow={{
              done: doneCount(slideshowRows),
              target: campaign.slideshow_target ?? 10,
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
                disabled={!editable}
                onPress={() => openRow(row.item)}
              />
            ))}
          </View>
        </View>
      )}

      <WeekTargetsSheet
        visible={targetsVisible}
        videoTarget={campaign?.video_target ?? 20}
        slideshowTarget={campaign?.slideshow_target ?? 10}
        saving={targetsSaving}
        onClose={() => setTargetsVisible(false)}
        onSave={(v, s) => void saveTargets(v, s)}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[3],
  },
  rows: {
    gap: 10,
  },
  empty: {
    marginTop: 56,
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
