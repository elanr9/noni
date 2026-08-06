// Briefs landing: one card per week (campaign). Open a card for that week's
// stamped posts grid.
import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/ui/Button';
import { PressableScale } from '../../../components/ui/PressableScale';
import {
  listCampaigns,
  type Campaign,
} from '../../../lib/briefs-api';
import { color, radius, shadow, type } from '../../../theme/tokens';

function mondayOf(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function weekRangeLabel(dropDate: string): string {
  const mon = mondayOf(dropDate);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const month = mon.toLocaleDateString(undefined, { month: 'short' });
  if (mon.getMonth() === sun.getMonth()) {
    return `${month} ${mon.getDate()}-${sun.getDate()}`;
  }
  return `${formatDay(mon)}-${formatDay(sun)}`;
}

function weekTitle(campaign: Campaign, weekNumber: number): string {
  if (!campaign.drop_date) return campaign.name;
  return `Week ${weekNumber}: ${weekRangeLabel(campaign.drop_date)}`;
}

export default function BriefsScreen() {
  const insets = useSafeAreaInsets();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCampaigns(await listCampaigns());
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

  // Oldest drop first → Week 1; list still shows newest on top.
  const weekNumberById = useMemo(() => {
    const chronological = [...campaigns].sort((a, b) => {
      const da = a.drop_date ?? '';
      const db = b.drop_date ?? '';
      if (da !== db) return da < db ? -1 : 1;
      return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1;
    });
    const map = new Map<string, number>();
    chronological.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [campaigns]);

  const latest = campaigns[0] ?? null;
  const canStartWeek = !latest || latest.status === 'published';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 6, paddingBottom: 116 },
      ]}
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
      <Text style={styles.h1}>Briefs</Text>
      <Text style={styles.subtitle}>One week, one card. Open to fill posts.</Text>

      {!loading && canStartWeek ? (
        <View style={styles.startCard}>
          <Text style={styles.startNote}>
            {latest
              ? 'Last week is live. Start the next week when you are ready.'
              : 'A week is one shared pool of posts for the whole roster.'}
          </Text>
          <Button
            size="md"
            variant="primary"
            icon="plus"
            onPress={() => router.push('/(admin)/week-setup')}
          >
            Start week
          </Button>
        </View>
      ) : null}

      <View style={styles.cards}>
        {campaigns.map((campaign) => {
          const n = weekNumberById.get(campaign.id) ?? 1;
          const status =
            campaign.status === 'published' ? 'Published' : 'Draft';
          return (
            <PressableScale
              key={campaign.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(admin)/week/${campaign.id}`)}
              style={styles.weekCard}
            >
              <Text style={styles.weekTitle}>{weekTitle(campaign, n)}</Text>
              <Text style={styles.weekMeta}>
                {status}
                {campaign.drop_date
                  ? ` · drops ${formatDay(new Date(`${campaign.drop_date}T00:00:00`))}`
                  : ''}
              </Text>
            </PressableScale>
          );
        })}
        {!loading && campaigns.length === 0 ? (
          <Text style={styles.empty}>No weeks yet. Start one above.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: 20 },
  h1: {
    fontSize: type.size.title,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  startCard: {
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: color.white,
    marginBottom: 16,
    ...shadow.shadowCard,
  },
  startNote: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
  },
  cards: { gap: 10 },
  weekCard: {
    padding: 18,
    borderRadius: radius.md,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  weekTitle: {
    fontSize: type.size.body,
    fontWeight: '800',
    color: color.ink,
  },
  weekMeta: {
    marginTop: 6,
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  empty: {
    paddingVertical: 28,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
});
