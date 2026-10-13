// One week (SSManager.jsx WeekScreen): week number and dates, the Reels and
// Slideshows counters that also switch format, then the numbered slots.
// Filled slots open the brief editor; empty ones open the kind picker.
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { editorHref, kindHref, parseFormat } from '../../../components/admin/briefs/routes';
import {
  BriefHeader,
  EmptySlotRow,
  FilledSlotRow,
  FormatCounterCard,
  HeaderIconButton,
} from '../../../components/shared/briefs';
import { SoftToast } from '../../../components/states/SoftToast';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import {
  briefWeekOpensLabel,
  briefWeekRangeLabel,
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

export default function WeekScreen() {
  const { id, added, format: formatParam } = useLocalSearchParams<{ id: string; added?: string; format?: string }>();
  const [lanes, setLanes] = useState<WeekLanes | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [format, setFormat] = useState<BriefMediaFormat>(parseFormat(formatParam));

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const next = await listWeekLanes(id);
      setLanes(next);
      setWeekNumber(await fetchWeekNumber(next.campaign));
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

  function openSlot(slot: WeekSlot) {
    if (!id) return;
    const base = { campaignId: id, briefId: slot.briefId, slot: String(slot.index), format: slot.format, week: String(week) };
    if (slot.brief) {
      router.push(editorHref({ ...base, kind: slot.brief.kind, postTypeKey: slot.brief.postTypeKey ?? undefined }));
    } else {
      router.push(kindHref(base));
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <Stack.Screen options={{ headerShown: false, title: 'Week' }} />
      <BriefHeader
        title={`Week ${week}`}
        sub={sub}
        onBack={() => router.back()}
        right={<HeaderIconButton icon="message-circle" label="Messages" onPress={() => router.push('/(admin)/messages' as Href)} />}
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
                  />
                ) : (
                  <EmptySlotRow key={slot.briefId} index={slot.index} onPress={() => openSlot(slot)} />
                ),
              )}
            </View>
          </>
        )}
      </ScrollView>
      <SoftToast
        visible={Boolean(added)}
        message={added ? `Added to slot ${added}` : ''}
        tone="success"
        onHide={() => router.setParams({ added: undefined, format: undefined })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, paddingBottom: 40, gap: 18 },
  stack: { gap: 12 },
  counters: { flexDirection: 'row', gap: 12 },
  slots: { gap: 10 },
  empty: { marginTop: 30 },
  notFound: {
    paddingVertical: 32,
    textAlign: 'center',
    fontFamily: typeToken.font.ui,
    fontSize: 15,
    color: color.slate400,
  },
});
