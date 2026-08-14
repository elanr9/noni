// One day of a finished week: what each creator posted and what it sold.
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  AdminScreen,
  Avatar,
  Card,
  PushHeader,
  SkeletonCard,
  Thumb,
} from '../../components/admin/shared';
import { formatMetric } from '../../lib/analytics';
import { useAuth } from '../../lib/auth';
import {
  getCampaign,
  listCampaigns,
  listWeekPosts,
  type BriefFormat,
  type WeekPostItem,
} from '../../lib/briefs-api';
import { color } from '../../theme/tokens';

function formatViews(n: number): string {
  return formatMetric(Math.round(n)).replace(/k/g, 'K');
}

function formatSales(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function formatLabel(format: BriefFormat): string {
  return format === 'photo_carousel' ? 'Slideshow' : 'Reel';
}

function dayTitle(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function WeekDayScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const { managerAccess } = useAuth();
  const showSales = managerAccess.viewFinancials;
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [posts, setPosts] = useState<WeekPostItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!id || !date) {
      setMissing(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [campaign, all, weekPosts] = await Promise.all([
        getCampaign(id),
        listCampaigns(),
        listWeekPosts(id),
      ]);
      if (!campaign) {
        setMissing(true);
        setPosts(null);
        return;
      }
      setMissing(false);
      const asc = [...all].sort((a, b) =>
        (a.drop_date ?? '') < (b.drop_date ?? '') ? -1 : 1,
      );
      const idx = asc.findIndex((c) => c.id === campaign.id);
      setWeekNumber(idx >= 0 ? idx + 1 : asc.length + 1);
      setPosts(weekPosts.filter((p) => p.postedDay === date));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, date]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const list = posts ?? [];
  const salesCents = list.reduce((sum, p) => sum + p.salesCents, 0);
  const weekLabel = weekNumber !== null ? `Week ${weekNumber}` : 'Week';
  const subtitleParts = [weekLabel, `${list.length} posts`];
  if (showSales) subtitleParts.push(`${formatSales(salesCents)} in sales`);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Day' }} />
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
      >
        <PushHeader
          title={date ? dayTitle(date) : 'Day'}
          subtitle={subtitleParts.join(' · ')}
          onBack={() => router.back()}
        />

        {loading ? (
          <View style={styles.stack}>
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
          </View>
        ) : missing ? (
          <Text style={styles.notFound}>Day not found</Text>
        ) : (
          <View style={styles.stack}>
            {list.map((p) => (
              <Card key={p.postId} pad={12} style={styles.row}>
                <Avatar name={p.creatorName} size={34} />
                <Thumb format={p.format} width={34} height={46} radius={8} />
                <View style={styles.body}>
                  <Text numberOfLines={1} style={styles.title}>
                    {p.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.meta}>
                    {`${p.creatorName} · ${formatLabel(p.format)}`}
                  </Text>
                </View>
                <View style={styles.metrics}>
                  <Text style={styles.views}>{formatViews(p.views)}</Text>
                  {showSales ? (
                    <Text style={styles.sales}>{formatSales(p.salesCents)}</Text>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        )}
      </AdminScreen>
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  meta: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
  },
  metrics: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  views: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  sales: {
    fontSize: 11,
    fontWeight: '700',
    color: color.green,
  },
  notFound: {
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: 15,
    color: color.slate400,
  },
});
