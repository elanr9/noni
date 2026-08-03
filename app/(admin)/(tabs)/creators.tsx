import { useCallback, useMemo, useState } from 'react';
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

import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  fetchCreatorLeaderboard,
  type CreatorLeaderboardRow,
} from '../../../lib/admin-api';
import { formatMetric } from '../../../lib/analytics';
import { formatCents } from '../../../lib/wallet-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

type SortKey =
  | 'views'
  | 'followers'
  | 'postsCompleted'
  | 'approvalRate'
  | 'revenueCents'
  | 'paidCents';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'views', label: 'Views' },
  { key: 'followers', label: 'Followers' },
  { key: 'postsCompleted', label: 'Posts' },
  { key: 'approvalRate', label: 'Approval' },
  { key: 'revenueCents', label: 'Revenue' },
  { key: 'paidCents', label: 'Paid' },
];

function sortValue(row: CreatorLeaderboardRow, key: SortKey): number {
  const value = row[key];
  return value ?? -1;
}

function formatFollowers(n: number | null): string {
  if (n === null) return '—';
  return formatMetric(n);
}

function formatApproval(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

export default function CreatorsScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<CreatorLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('views');

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setRows(await fetchCreatorLeaderboard(profile.company_id));
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

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey)),
    [rows, sortKey],
  );

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
      <Text style={styles.h1}>Creators</Text>
      <Text style={styles.subtitle}>
        Tap a column to sort. Tap a creator for posts, chat, earnings.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
      >
        {SORTS.map((s) => {
          const active = s.key === sortKey;
          return (
            <PressableScale
              key={s.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSortKey(s.key)}
              style={[styles.sortChip, active && styles.sortChipActive]}
            >
              <Text
                style={[styles.sortText, active && styles.sortTextActive]}
              >
                {s.label}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      {loading ? (
        <Text style={styles.empty}>Loading creators…</Text>
      ) : sorted.length === 0 ? (
        <Text style={styles.empty}>No creators on the roster yet.</Text>
      ) : (
        sorted.map((c, i) => (
          <PressableScale
            key={c.creatorId}
            accessibilityRole="button"
            accessibilityLabel={`Open ${c.creatorName}`}
            onPress={() =>
              router.push({
                pathname: '/(admin)/creator/[id]',
                params: { id: c.creatorId },
              })
            }
            style={[styles.card, shadow.shadowCard]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {c.creatorName}
              </Text>
            </View>
            <View style={styles.statGrid}>
              <Cell label="Views" value={formatMetric(c.views)} active={sortKey === 'views'} />
              <Cell label="Followers" value={formatFollowers(c.followers)} active={sortKey === 'followers'} />
              <Cell label="Posts" value={`${c.postsCompleted}`} active={sortKey === 'postsCompleted'} />
              <Cell label="Approval" value={formatApproval(c.approvalRate)} active={sortKey === 'approvalRate'} />
              <Cell label="Revenue" value={formatCents(c.revenueCents)} active={sortKey === 'revenueCents'} />
              <Cell label="Paid" value={formatCents(c.paidCents)} active={sortKey === 'paidCents'} />
            </View>
          </PressableScale>
        ))
      )}
    </ScrollView>
  );
}

function Cell(props: { label: string; value: string; active: boolean }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellValue, props.active && styles.cellValueActive]}>
        {props.value}
      </Text>
      <Text style={styles.cellLabel}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, gap: 10 },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
    marginTop: 10,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    marginBottom: 4,
  },
  sortRow: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  sortChipActive: {
    backgroundColor: color.blue100,
    borderColor: color.blue600,
  },
  sortText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  sortTextActive: { color: color.blue700 },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: color.blue100,
    color: color.blue700,
    fontSize: type.size.micro,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  cardTitle: {
    flex: 1,
    fontSize: type.size.body,
    fontWeight: '800',
    color: color.ink,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  cell: { width: '33.33%', gap: 1 },
  cellValue: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.ink,
  },
  cellValueActive: { color: color.blue700 },
  cellLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
});
