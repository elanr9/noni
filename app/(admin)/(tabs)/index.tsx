import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MusicApprovalRow } from '../../../components/admin/MusicApprovalRow';
import { NextUpCard } from '../../../components/admin/NextUpCard';
import { QueueRow } from '../../../components/admin/QueueRow';
import { QueueSkeletonRow } from '../../../components/admin/QueueSkeletonRow';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import { Wordmark } from '../../../components/ui/Wordmark';
import {
  approveMusic,
  countAssignmentsInFlight,
  latestSubmissionsByAssignment,
  listAssignmentQueue,
  listMusicApprovalQueue,
  type MusicApprovalItem,
} from '../../../lib/admin-api';
import {
  listAccountApprovalQueue,
  type AccountApprovalItem,
} from '../../../lib/creator-accounts-api';
import { useAuth } from '../../../lib/auth';
import { toAssignmentQueueRow } from '../../../lib/admin-queue-map';
import type { MockQueueItem } from '../../../lib/admin-review-types';
import { color, radius, space, type } from '../../../theme/tokens';

const SUBTITLE_DEFAULT =
  "Approve and it's live. Editing, posting and tracking are automatic.";
const SUBTITLE_ONE_LEFT = "One to clear, then you're done for today.";

type QueueFilter =
  | { kind: 'all' }
  | { kind: 'creator'; id: string }
  | { kind: 'brief'; id: string };

function useAdminQueue(companyId: string | undefined): {
  items: MockQueueItem[];
  music: MusicApprovalItem[];
  accounts: AccountApprovalItem[];
  loading: boolean;
  inFlight: number;
  reload: () => Promise<void>;
} {
  const [items, setItems] = useState<MockQueueItem[]>([]);
  const [music, setMusic] = useState<MusicApprovalItem[]>([]);
  const [accounts, setAccounts] = useState<AccountApprovalItem[]>([]);
  const [inFlight, setInFlight] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (companyId === undefined) return;
    try {
      const [queue, flying, musicQueue, accountQueue] = await Promise.all([
        listAssignmentQueue(),
        countAssignmentsInFlight(),
        listMusicApprovalQueue(companyId),
        listAccountApprovalQueue(companyId),
      ]);
      const subs = await latestSubmissionsByAssignment(queue.map((a) => a.id));
      setItems(queue.map((a) => toAssignmentQueueRow(a, subs.get(a.id) ?? null)));
      setInFlight(flying);
      setMusic(musicQueue);
      setAccounts(accountQueue);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  return { items, music, accounts, loading, inFlight, reload: load };
}

function matchesFilter(item: MockQueueItem, filter: QueueFilter): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'creator') return item.creator.id === filter.id;
  return item.brief?.id === filter.id;
}

export default function QueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { items, music, accounts, loading, inFlight, reload } = useAdminQueue(
    profile?.company_id,
  );
  const [filter, setFilter] = useState<QueueFilter>({ kind: 'all' });
  const [musicBusy, setMusicBusy] = useState<string | null>(null);

  const approveMusicItem = async (assignmentId: string) => {
    if (!profile) return;
    setMusicBusy(assignmentId);
    try {
      await approveMusic({
        companyId: profile.company_id,
        assignmentId,
        adminId: profile.id,
      });
      await reload();
    } catch (e) {
      Alert.alert("Couldn't approve", e instanceof Error ? e.message : 'Try again');
    } finally {
      setMusicBusy(null);
    }
  };

  const n = items.length;
  const visible = items.filter((i) => matchesFilter(i, filter));

  const creators = [...new Map(items.map((i) => [i.creator.id, i.creator])).values()];
  const briefs = [
    ...new Map(
      items.flatMap((i) => (i.brief ? [[i.brief.id, i.brief] as const] : [])),
    ).values(),
  ];

  const chips: Array<{ key: string; label: string; filter: QueueFilter }> = [
    { key: 'all', label: `All ${n}`, filter: { kind: 'all' } },
    ...creators.map((c) => ({
      key: `creator:${c.id}`,
      label: c.name,
      filter: { kind: 'creator', id: c.id } as QueueFilter,
    })),
    ...briefs.map((b) => ({
      key: `brief:${b.id}`,
      label: b.title,
      filter: { kind: 'brief', id: b.id } as QueueFilter,
    })),
  ];

  const openReview = (id: string) => {
    const params =
      filter.kind === 'creator'
        ? `?creator=${filter.id}`
        : filter.kind === 'brief'
          ? `?brief=${filter.id}`
          : '';
    router.push(`/(admin)/review/${id}${params}`);
  };

  const subtitle = loading ? null : n >= 2 ? SUBTITLE_DEFAULT : n === 1 ? SUBTITLE_ONE_LEFT : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 6 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Wordmark size={20} />
        {loading ? (
          <SkeletonLine width={82} height={28} radius={radius.pill} />
        ) : (
          <View style={[styles.countPill, n === 0 && styles.countPillClear]}>
            <Text style={[styles.countPillText, n === 0 && styles.countPillTextClear]}>
              {n === 0 ? 'All clear' : `${n} waiting`}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.h1}>Queue</Text>
      {subtitle !== null && <Text style={styles.subtitle}>{subtitle}</Text>}

      {music.length > 0 && (
        <View style={styles.sideQueue}>
          <Text style={styles.sectionLabel}>Music approvals</Text>
          {music.map((item) => (
            <MusicApprovalRow
              key={item.assignment.id}
              item={item}
              busy={musicBusy === item.assignment.id}
              onApprove={() => void approveMusicItem(item.assignment.id)}
            />
          ))}
        </View>
      )}

      {accounts.length > 0 && (
        <View style={styles.sideQueue}>
          <Text style={styles.sectionLabel}>Account approvals</Text>
          {accounts.map((account) => (
            <PressableScale
              key={account.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(admin)/account-approval/[accountId]',
                  params: { accountId: account.id },
                })
              }
              style={styles.accountRow}
            >
              <View style={styles.accountText}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {account.profiles?.full_name?.trim() || 'Creator'}
                </Text>
                <Text style={styles.accountMeta} numberOfLines={1}>
                  {account.tiktok_handle ? `@${account.tiktok_handle}` : 'No TikTok handle'}
                  {' · '}
                  {account.instagram_handle
                    ? `@${account.instagram_handle}`
                    : 'No Instagram handle'}
                </Text>
              </View>
              <Text style={styles.accountCta}>Review</Text>
            </PressableScale>
          ))}
        </View>
      )}

      {!loading && n >= 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {chips.map((chip) => {
            const selected =
              chip.filter.kind === filter.kind &&
              (chip.filter.kind === 'all' ||
                (filter.kind !== 'all' && chip.filter.id === filter.id));
            return (
              <PressableScale
                key={chip.key}
                accessibilityRole="button"
                onPress={() => setFilter(chip.filter)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {chip.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.list}>
          <QueueSkeletonRow />
          <QueueSkeletonRow />
          <QueueSkeletonRow />
          <QueueSkeletonRow />
        </View>
      ) : n === 0 ? (
        <EmptyState
          icon="circle-check-big"
          title="Nothing to review"
          body={
            inFlight > 0
              ? `Everything submitted is approved and scheduled. ${inFlight} posts are with creators.`
              : 'Everything submitted is approved and scheduled.'
          }
          actionLabel="Open Calendar"
          onAction={() => router.navigate('/(admin)/(tabs)/calendar')}
          style={styles.empty}
        />
      ) : n === 1 ? (
        <View style={styles.oneLeft}>
          <QueueRow item={items[0]} onPress={() => openReview(items[0].id)} />
          <NextUpCard inFlight={inFlight} />
        </View>
      ) : (
        <View style={styles.list}>
          {visible.map((item) => (
            <QueueRow key={item.id} item={item} onPress={() => openReview(item.id)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingBottom: 116,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  countPillClear: {
    backgroundColor: color.greenSoft,
  },
  countPillText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  countPillTextClear: {
    color: color.green,
  },
  h1: {
    marginTop: 16,
    fontSize: type.size.titleXl,
    lineHeight: 38,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: type.size.bodySm,
    lineHeight: 21,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  sideQueue: {
    gap: 8,
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
  },
  accountText: { flex: 1, gap: 2 },
  accountName: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  accountMeta: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  accountCta: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  chipScroll: {
    marginBottom: 14,
    flexGrow: 0,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    maxWidth: 180,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  chipSelected: {
    backgroundColor: color.ink,
  },
  chipText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  chipTextSelected: {
    color: color.white,
  },
  list: {
    gap: space.stackGap,
  },
  oneLeft: {
    gap: 20,
  },
  empty: {
    marginTop: 56,
    paddingTop: 0,
  },
});
