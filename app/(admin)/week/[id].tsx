// One week (SSManager.jsx WeekScreen): week number and dates, the Reels and
// Slideshows counters that also switch format, then the numbered slots.
// Filled slots open the brief editor; empty ones open the kind picker.
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { editorHref, ideasHref, kindHref, parseFormat } from '../../../components/admin/briefs/routes';
import { slotLabel } from '../../../lib/brief-copy';
import { WeekFooter, type WeekPhase } from '../../../components/admin/grid/WeekFooter';
import {
  BriefHeader,
  EmptySlotRow,
  FilledSlotRow,
  FormatCounterCard,
  HeaderIconButton,
  InkToast,
} from '../../../components/shared/briefs';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import {
  clearWeekSlot,
  briefWeekOpensLabel,
  briefWeekRangeLabel,
  listPublishedCampaignDays,
  listWeekLanes,
  weekNumber as fetchWeekNumber,
  type BriefMediaFormat,
  type WeekLanes,
  type WeekSlot,
} from '../../../lib/briefs-api';
import { color, space, type as typeToken } from '../../../theme/tokens';

function filledCount(slots: WeekSlot[]): number {
  return slots.filter((s) => s.brief !== null).length;
}

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

/** True before Sunday 8:00 PM in New York of the drop week, the notify cutoff publish-campaign schedules against. */
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
  const get = (unit: string): string => parts.find((p) => p.type === unit)?.value ?? '00';
  const nyDate = `${get('year')}-${get('month')}-${get('day')}`;
  if (nyDate !== sundayIso) return nyDate < sundayIso;
  return Number(get('hour')) < 20;
}

export default function WeekScreen() {
  const { id, added, format: formatParam } = useLocalSearchParams<{ id: string; added?: string; format?: string }>();
  const [lanes, setLanes] = useState<WeekLanes | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [format, setFormat] = useState<BriefMediaFormat>(parseFormat(formatParam));
  /** Brief ids already with creators; editing those changes live posts. */
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const next = await listWeekLanes(id);
      setLanes(next);
      const [n, sent] = await Promise.all([
        fetchWeekNumber(next.campaign),
        next.campaign.status === 'published' ? listPublishedCampaignDays(next.campaign.id).then((d) => d.briefIds).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
      ]);
      setWeekNumber(n);
      setSentIds(sent);
    } catch {
      setLanes(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (formatParam) setFormat(parseFormat(formatParam));
      void load();
    }, [load, formatParam]),
  );

  const campaign = lanes?.campaign ?? null;
  const slots = lanes ? lanes[format] : [];
  const sub =
    campaign?.drop_date != null
      ? `${briefWeekRangeLabel(campaign.drop_date)} \u00b7 ${briefWeekOpensLabel(campaign.drop_date)}`
      : undefined;
  const week = weekNumber ?? 1;
  const needsWeekSetup = lanes !== null && lanes.slideshow.length === 0 && lanes.reel.length === 0;

  const allSlots = lanes ? [...lanes.reel, ...lanes.slideshow] : [];
  const readyCount = allSlots.filter((s) => s.brief?.status === 'ready').length;
  const leftCount = allSlots.length - readyCount;
  const published = campaign?.status === 'published';
  const editable = campaign?.status === 'draft';
  // Publishing waits for the full week: every slot filled and ready. Once
  // published, the day planner sends the ready posts not out yet.
  const phase: WeekPhase = 'complete';
  const showFooter = !needsWeekSetup && !published && editable && allSlots.length > 0 && leftCount === 0;
  const unsentReady = allSlots.filter((s) => s.brief?.status === 'ready' && !sentIds.has(s.briefId)).length;
  const showPlanMore = !needsWeekSetup && published && unsentReady > 0;

  /** Publish opens the day planner: pick or randomize the days. */
  function openPlanner() {
    if (!campaign) return;
    router.push({ pathname: '/(admin)/week-plan', params: { id: campaign.id } } as Href);
  }

  function openSlot(slot: WeekSlot) {
    if (!id) return;
    const base = { campaignId: id, briefId: slot.briefId, slot: String(slot.index), format: slot.format, week: String(week) };
    if (slot.brief) {
      const href = editorHref({ ...base, kind: slot.brief.kind, postTypeKey: slot.brief.postTypeKey ?? undefined });
      if (sentIds.has(slot.briefId)) {
        Alert.alert('Already with creators', 'Edits change the post creators already have and replace their own wording of it.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Edit anyway', style: 'destructive', onPress: () => router.push(href) },
        ]);
        return;
      }
      router.push(href);
    } else {
      router.push(kindHref(base));
    }
  }

  /** Empty a filled slot: confirm, clear on screen at once, then on the server. */
  function clearSlot(slot: WeekSlot) {
    const label = slotLabel(slot.index);
    if (sentIds.has(slot.briefId)) {
      Alert.alert('Already with creators', 'This post went out to creators, so it can only be edited, not cleared.');
      return;
    }
    Alert.alert(`Clear slot ${label}?`, 'The post is removed and the slot goes back to empty.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setLanes((cur) => (cur ? { ...cur, [slot.format]: cur[slot.format].map((s) => (s.briefId === slot.briefId ? { ...s, brief: null } : s)) } : cur));
          setCleared(label);
          clearWeekSlot(slot.briefId).catch((e: unknown) => {
            setCleared(null);
            void load();
            Alert.alert('Could not clear', e instanceof Error ? e.message : 'Try again.');
          });
        },
      },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <Stack.Screen options={{ headerShown: false, title: 'Week' }} />
      <BriefHeader
        title={`Week ${week}`}
        sub={sub}
        onBack={() => router.back()}
        right={
          <View style={styles.headerActions}>
            {id ? (
              <HeaderIconButton icon="sparkles" label="Ideas" onPress={() => router.push(ideasHref({ campaignId: id, week: String(week) }))} />
            ) : null}
            <HeaderIconButton icon="message-circle" label="Messages" onPress={() => router.push('/(admin)/(tabs)/messages' as Href)} />
          </View>
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
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
        {loading ? (
          <View style={styles.stack}>
            <View style={styles.counters}>
              <SkeletonCard height={112} />
              <SkeletonCard height={112} />
            </View>
            <SkeletonCard height={78} />
            <SkeletonCard height={56} />
            <SkeletonCard height={56} />
          </View>
        ) : lanes === null ? (
          <Text style={styles.notFound}>Week not found</Text>
        ) : needsWeekSetup ? (
          <EmptyState
            icon="layout-list"
            title="Not planned yet"
            body="Pick videos and slideshows a day and the rows appear."
            actionLabel={`Start week ${week}`}
            onAction={() => router.push('/(admin)/week-setup')}
            style={styles.empty}
          />
        ) : (
          <>
            <View style={styles.counters}>
              <FormatCounterCard
                format="reel"
                done={filledCount(lanes.reel)}
                total={lanes.reel.length}
                active={format === 'reel'}
                onPress={() => setFormat('reel')}
              />
              <FormatCounterCard
                format="slideshow"
                done={filledCount(lanes.slideshow)}
                total={lanes.slideshow.length}
                active={format === 'slideshow'}
                onPress={() => setFormat('slideshow')}
              />
            </View>
            <View style={styles.slots}>
              {slots.map((slot) =>
                slot.brief ? (
                  <FilledSlotRow
                    key={slot.briefId}
                    index={slot.index}
                    title={slot.brief.title || slot.brief.story?.theme || 'Freestyle'}
                    kind={slot.brief.kind}
                    format={slot.format}
                    postTypeName={slot.brief.postTypeName}
                    onPress={() => openSlot(slot)}
                    onClear={() => clearSlot(slot)}
                  />
                ) : (
                  <EmptySlotRow key={slot.briefId} index={slot.index} onPress={() => openSlot(slot)} />
                ),
              )}
            </View>
            {showFooter ? (
              <WeekFooter
                phase={phase}
                left={leftCount}
                weekNumber={week}
                beforeCutoff={campaign?.drop_date ? isBeforeNotifyCutoff(campaign.drop_date) : true}
                publishing={false}
                onPublish={openPlanner}
                onStartNext={openPlanner}
              />
            ) : null}
            {showPlanMore ? (
              <View style={styles.planMore}>
                <Button variant="primary" size="md" block onPress={openPlanner}>
                  Plan more days
                </Button>
                <Text style={styles.planMoreLine}>{`${unsentReady} ready ${unsentReady === 1 ? 'post is' : 'posts are'} not with creators yet.`}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <InkToast
        visible={Boolean(added)}
        message={added ? `Added to slot ${added}` : ''}
        onHide={() => router.setParams({ added: undefined, format: undefined })}
      />
      <InkToast visible={cleared !== null} message={cleared ? `Cleared slot ${cleared}` : ''} onHide={() => setCleared(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.offWhite },
  headerActions: { flexDirection: 'row', gap: 8 },
  content: { paddingHorizontal: space.gutter, paddingBottom: 40, gap: 18 },
  stack: { gap: 12 },
  counters: { flexDirection: 'row', gap: 12 },
  slots: { gap: 10 },
  empty: { marginTop: 30 },
  planMore: { gap: 8 },
  planMoreLine: { textAlign: 'center', fontFamily: typeToken.font.ui, fontSize: 12.5, lineHeight: 12.5 * 1.45, color: color.slate400 },
  notFound: {
    paddingVertical: 32,
    textAlign: 'center',
    fontFamily: typeToken.font.ui,
    fontSize: 15,
    color: color.slate400,
  },
});
