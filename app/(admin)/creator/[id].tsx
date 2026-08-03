import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { StatusChip } from '../../../components/StatusChip';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import { fetchCreatorDetail, type CreatorDetail } from '../../../lib/admin-api';
import { formatMetric } from '../../../lib/analytics';
import { parseAssignmentMetrics } from '../../../lib/tasks-api';
import { formatCents, ledgerKindLabel } from '../../../lib/wallet-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function AdminCreatorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [data, setData] = useState<CreatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !id) return;
    try {
      setData(await fetchCreatorDetail(profile.company_id, id));
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const paidCents = (data?.ledger ?? [])
    .filter((entry) => entry.kind === 'payout_paid')
    .reduce((sum, entry) => sum + -entry.amountCents, 0);
  const earnedCents = (data?.ledger ?? [])
    .filter((entry) => entry.amountCents > 0)
    .reduce((sum, entry) => sum + entry.amountCents, 0);

  return (
    <>
      <Stack.Screen options={{ title: data?.name ?? 'Creator' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
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
        {loading || !data ? (
          <Text style={styles.empty}>Loading creator…</Text>
        ) : (
          <>
            <View style={styles.totalsRow}>
              <Stat label="Earned" value={formatCents(earnedCents)} />
              <Stat label="Paid out" value={formatCents(paidCents)} />
              <Stat label="Posts" value={`${data.assignments.length}`} />
            </View>

            <Text style={styles.section}>Posts</Text>
            {data.assignments.length === 0 ? (
              <Text style={styles.empty}>No assignments yet.</Text>
            ) : (
              data.assignments.map((a) => {
                const metrics = parseAssignmentMetrics(a.metrics);
                return (
                  <PressableScale
                    key={a.id}
                    accessibilityRole={a.post_url ? 'link' : 'none'}
                    disabled={!a.post_url}
                    onPress={() => {
                      if (a.post_url) void Linking.openURL(a.post_url);
                    }}
                    style={[styles.card, shadow.shadowCard]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {a.briefs.title}
                      </Text>
                      <StatusChip status={a.status} />
                    </View>
                    <Text style={styles.cardMeta}>
                      {formatDate(a.scheduled_date)}
                      {metrics.views !== undefined
                        ? ` · ${formatMetric(metrics.views)} views`
                        : ''}
                      {a.post_url ? ' · open post' : ''}
                    </Text>
                  </PressableScale>
                );
              })
            )}

            <Text style={styles.section}>Chat history</Text>
            {data.events.length === 0 ? (
              <Text style={styles.empty}>No review activity yet.</Text>
            ) : (
              data.events.map((e) => (
                <View key={e.id} style={[styles.card, shadow.shadowCard]}>
                  <Text style={styles.cardTitle}>
                    {e.profiles?.full_name?.trim() || 'Someone'}
                    <Text style={styles.eventAction}>
                      {e.action === 'approved'
                        ? ' approved'
                        : e.action === 'changes_requested'
                          ? ' requested changes'
                          : ' commented'}
                    </Text>
                  </Text>
                  {e.note ? <Text style={styles.note}>{e.note}</Text> : null}
                  <Text style={styles.cardMeta}>{formatDate(e.created_at)}</Text>
                </View>
              ))
            )}

            <Text style={styles.section}>Earnings</Text>
            {data.ledger.length === 0 ? (
              <Text style={styles.empty}>No ledger entries yet.</Text>
            ) : (
              data.ledger.map((entry) => (
                <View key={entry.id} style={[styles.card, shadow.shadowCard]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>
                      {ledgerKindLabel(entry.kind)}
                    </Text>
                    <Text
                      style={[
                        styles.amount,
                        entry.amountCents < 0 && styles.amountNegative,
                      ]}
                    >
                      {formatCents(entry.amountCents)}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {formatDate(entry.createdAt)}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </>
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
  content: { paddingHorizontal: space.gutter, paddingVertical: 12, gap: 10 },
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  cardMeta: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  eventAction: { fontWeight: '600', color: color.slate500 },
  note: {
    fontSize: type.size.bodySm,
    fontWeight: '500',
    color: color.ink,
    lineHeight: 20,
  },
  amount: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.ink,
  },
  amountNegative: { color: color.slate500 },
});
