import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { PostRow } from '../../../../components/creator/PostRow';
import {
  fetchCampaignNames,
  groupWeeks,
  isPostedStatus,
  shortDateLabel,
  viralityTopPercents,
  weekName,
  type CreatorWeek,
} from '../../../../components/creator/posts-shared';
import { Screen } from '../../../../components/layout/Screen';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Icon } from '../../../../components/ui/Icon';
import { PressableScale } from '../../../../components/ui/PressableScale';
import { slotTimeLabel, useCreatorQueue } from '../../../../lib/creator-queue';
import { formatCount } from '../../../../lib/earnings';
import type { AssignmentWithBrief } from '../../../../lib/tasks-api';
import { parseAssignmentMetrics } from '../../../../lib/tasks-api';
import { color, radius, shadow, space, type } from '../../../../theme/tokens';

function StatusPill({ status }: { status: CreatorWeek['status'] }) {
  const paid = status === 'paid';
  const label = status === 'this' ? 'This week' : paid ? 'Paid' : 'Upcoming';
  const fg = paid ? color.green : color.blue700;
  const bg = paid ? color.greenSoft : color.blue100;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.pillDot, { backgroundColor: fg }]} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export default function WeekDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const { assignments } = useCreatorQueue();
  const [campaignNames, setCampaignNames] = useState<Map<string, string>>(
    new Map(),
  );

  const week = useMemo(
    () => groupWeeks(assignments).find((w) => w.startKey === key) ?? null,
    [assignments, key],
  );
  const topPercents = useMemo(
    () => viralityTopPercents(assignments),
    [assignments],
  );

  useEffect(() => {
    if (week === null) return;
    const ids = [
      ...new Set(
        week.items
          .map((a) => a.campaign_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (ids.length === 0) return;
    let cancelled = false;
    fetchCampaignNames(ids)
      .then((names) => {
        if (!cancelled) setCampaignNames(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [week]);

  const bestFirst = useMemo(() => {
    if (week === null) return [];
    const views = (a: AssignmentWithBrief) =>
      parseAssignmentMetrics(a.metrics).views ?? 0;
    return [...week.items].sort((a, b) => views(b) - views(a));
  }, [week]);

  const openRow = (a: AssignmentWithBrief) => {
    if (isPostedStatus(a.status)) {
      router.push(`/(creator)/posts/${a.id}` as Href);
    } else {
      router.push(`/(creator)/assignment/${a.id}` as Href);
    }
  };

  if (week === null) {
    return (
      <Screen bg={color.offWhite} contentStyle={styles.center}>
        <EmptyState
          icon="calendar-days"
          title="Week not found"
          body="This week is outside your queue window."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const paid = week.status === 'paid';

  return (
    <Screen scroll={false} bg={color.offWhite} contentStyle={styles.screenContent}>
      <View style={styles.headerRow}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle}>
            {`Week ${week.index} · ${week.rangeLabel}`}
          </Text>
          <Text style={styles.headerSub} numberOfLines={2}>
            {weekName(week, campaignNames)}
          </Text>
        </View>
        <StatusPill status={week.status} />
      </View>

      <View style={styles.statsRow}>
        {(
          [
            { label: 'VIEWS', value: formatCount(week.views), money: false },
            { label: 'LIKES', value: formatCount(week.likes), money: false },
            {
              label: paid ? 'PAID' : 'EARNED SO FAR',
              value: `$${week.earned.toFixed(2)}`,
              money: true,
            },
          ] as const
        ).map((s) => (
          <View key={s.label} style={[styles.statCard, shadow.shadowCard]}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={[styles.statValue, s.money && styles.statValueMoney]}>
              {s.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.listHeadRow}>
        <Text style={styles.listHead}>Posts, best first</Text>
        <Text style={styles.listCount}>{`${week.items.length} posts`}</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.column}
        showsVerticalScrollIndicator={false}
      >
        {bestFirst.map((a) => {
          const m = parseAssignmentMetrics(a.metrics);
          return (
            <PostRow
              key={a.id}
              title={a.briefs.title}
              isPhoto={a.briefs.format === 'photo_carousel'}
              time={slotTimeLabel(a.slot_index)}
              date={shortDateLabel(a.scheduled_date)}
              views={m.views ?? 0}
              likes={m.likes ?? 0}
              topPercent={topPercents.get(a.id)}
              status={a.status}
              onPress={() => openRow(a)}
            />
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: space[3],
    paddingBottom: 0,
    gap: space[4],
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerTitle: {
    fontSize: type.size.cardLg,
    lineHeight: type.size.cardLg * type.leading.title,
    letterSpacing: -0.4,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  headerSub: {
    fontSize: type.size.chip,
    lineHeight: type.size.chip * type.leading.snug,
    color: color.slate500,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  pillText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: space[3],
  },
  statCard: {
    flex: 1,
    gap: 6,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  statLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    color: color.slate400,
  },
  statValue: {
    fontSize: type.size.cardLg,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.4,
    color: color.ink,
  },
  statValueMoney: {
    color: color.green,
  },
  listHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listHead: {
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  listCount: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  column: {
    gap: space[3],
    paddingBottom: space[10],
  },
});
