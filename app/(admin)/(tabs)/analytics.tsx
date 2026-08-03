import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  fetchBriefAnalytics,
  startMetricsPoll,
  type BriefAnalytics,
} from '../../../lib/admin-api';
import { formatMetric } from '../../../lib/analytics';
import { formatCents } from '../../../lib/wallet-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

function formatLabel(format: string): string {
  return format === 'photo_carousel' ? 'Photo carousel' : 'Video';
}

export default function AnalyticsScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<BriefAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setData(await fetchBriefAnalytics(profile.company_id));
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pollNow() {
    setPolling(true);
    try {
      await startMetricsPoll();
      await load();
      Alert.alert('Metrics updated', 'Fresh numbers from Upload-Post.');
    } catch (e) {
      Alert.alert('Poll failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPolling(false);
    }
  }

  const totals = data?.totals;

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
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Analytics</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/(admin)/(tabs)/settings')}
          style={styles.gearBtn}
        >
          <Icon name="settings" size={20} color={color.slate500} />
        </PressableScale>
      </View>
      <Text style={styles.subtitle}>
        Performance per brief across creators. Best hooks, formats, creators.
      </Text>

      <Button
        size="sm"
        variant="primary"
        block
        disabled={polling}
        onPress={() => void pollNow()}
        style={styles.pollBtn}
      >
        {polling ? 'Polling…' : 'Poll metrics now'}
      </Button>

      {loading || !data || !totals ? (
        <Text style={styles.empty}>Loading analytics…</Text>
      ) : (
        <>
          <View style={styles.totalsRow}>
            <Stat label="Views" value={formatMetric(totals.views)} />
            <Stat label="Revenue" value={formatCents(totals.revenueCents)} />
            <Stat label="Bounties" value={formatCents(totals.bountiesPaidCents)} />
          </View>

          <Text style={styles.section}>Briefs</Text>
          {data.briefs.length === 0 ? (
            <Text style={styles.empty}>No assignments yet.</Text>
          ) : (
            data.briefs.map((b) => (
              <View key={b.briefId} style={[styles.card, shadow.shadowCard]}>
                <Text style={styles.cardTitle}>{b.title}</Text>
                <Text style={styles.cardMeta}>
                  {formatLabel(b.format)} · {b.creators} creators · {b.posted}{' '}
                  posted
                </Text>
                <Text style={styles.cardMeta}>
                  {formatMetric(b.views)} views · {formatMetric(b.likes)} likes
                  {b.revenueCents > 0 ? ` · ${formatCents(b.revenueCents)}` : ''}
                </Text>
              </View>
            ))
          )}

          <Text style={styles.section}>Best hooks</Text>
          {data.bestHooks.length === 0 ? (
            <Text style={styles.empty}>Hooks rank once briefs have views.</Text>
          ) : (
            data.bestHooks.map((h, i) => (
              <View key={`${h.title}-${i}`} style={[styles.card, shadow.shadowCard]}>
                <Text style={styles.hook}>{h.hook}</Text>
                <Text style={styles.cardMeta}>
                  {formatMetric(h.views)} views · {h.title}
                </Text>
              </View>
            ))
          )}

          <Text style={styles.section}>Best formats</Text>
          {data.bestFormats.length === 0 ? (
            <Text style={styles.empty}>No format data yet.</Text>
          ) : (
            data.bestFormats.map((f) => (
              <View key={f.format} style={[styles.card, shadow.shadowCard]}>
                <Text style={styles.cardTitle}>{formatLabel(f.format)}</Text>
                <Text style={styles.cardMeta}>
                  {formatMetric(f.views)} views · {f.posted} posted
                </Text>
              </View>
            ))
          )}

          <Text style={styles.section}>Best creators</Text>
          {data.bestCreators.length === 0 ? (
            <Text style={styles.empty}>Creators rank once posts have views.</Text>
          ) : (
            data.bestCreators.map((c, i) => (
              <View
                key={`${c.creatorName}-${i}`}
                style={[styles.card, shadow.shadowCard]}
              >
                <Text style={styles.cardTitle}>{c.creatorName}</Text>
                <Text style={styles.cardMeta}>
                  {formatMetric(c.views)} views · {c.posted} posted
                </Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <View style={[styles.stat, shadow.shadowCard]}>
      <Text style={styles.statValue}>{props.value}</Text>
      <Text style={styles.statLabel}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, gap: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    marginBottom: 4,
  },
  pollBtn: { marginBottom: 8 },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  totalsRow: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 4,
  },
  statValue: {
    fontSize: type.size.card,
    fontWeight: '800',
    color: color.ink,
  },
  statLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  section: {
    marginTop: 14,
    marginBottom: 2,
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 4,
  },
  cardTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  cardMeta: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  hook: {
    fontSize: type.size.body,
    fontWeight: '700',
    color: color.ink,
    lineHeight: 22,
  },
});
