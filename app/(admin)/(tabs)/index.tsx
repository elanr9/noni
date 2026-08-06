import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { AccountRow } from '../../../components/admin/AccountRow';
import { MusicApprovalRow } from '../../../components/admin/MusicApprovalRow';
import {
  AdminHeader,
  AdminScreen,
  SectionLabel,
  Segmented,
  SkeletonCard,
} from '../../../components/admin/shared';
import { SubmissionRow } from '../../../components/admin/SubmissionRow';
import { EmptyState } from '../../../components/ui/EmptyState';
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
import { color, radiusAdmin, type } from '../../../theme/tokens';

const SUBTITLE_DEFAULT =
  "Approve and it's live. Editing, posting and tracking are automatic.";
const SUBTITLE_ONE_LEFT = "One to clear, then you're done for today.";
const SUBTITLE_CLEARED = 'All caught up. New submissions land here on their own.';
const FOOTER_NOTE = 'Reject a single clip and only that clip goes back.';

/** MockQueueItem plus the media-badge facts the row spec needs. */
type SubmissionQueueRow = {
  item: MockQueueItem;
  /** submissions.version — attempt lives on the submission. */
  attempt: number;
  /** hook + points + outro, from the brief. Null when the brief has no count. */
  unitCount: number | null;
};

function useAdminQueue(companyId: string | undefined): {
  posts: SubmissionQueueRow[];
  music: MusicApprovalItem[];
  accounts: AccountApprovalItem[];
  loading: boolean;
  inFlight: number;
  reload: () => Promise<void>;
} {
  const [posts, setPosts] = useState<SubmissionQueueRow[]>([]);
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
      setPosts(
        queue.map((a) => {
          const submission = subs.get(a.id) ?? null;
          return {
            item: toAssignmentQueueRow(a, submission),
            attempt: submission?.version ?? 1,
            unitCount: a.briefs.point_count !== null ? a.briefs.point_count + 2 : null,
          };
        }),
      );
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

  return { posts, music, accounts, loading, inFlight, reload: load };
}

export default function ReviewScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { posts, music, accounts, loading, inFlight, reload } = useAdminQueue(
    profile?.company_id,
  );
  const [lane, setLane] = useState(0);
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

  const total = posts.length + music.length + accounts.length;
  const subtitle =
    total === 0 ? SUBTITLE_CLEARED : total === 1 ? SUBTITLE_ONE_LEFT : SUBTITLE_DEFAULT;

  const pendingAccounts = accounts.filter((a) => a.status !== 'needs_changes');
  const sentBackAccounts = accounts.filter((a) => a.status === 'needs_changes');

  const openAccount = (accountId: string) =>
    router.push({
      pathname: '/(admin)/account-approval/[accountId]',
      params: { accountId },
    });

  return (
    <AdminScreen>
      <AdminHeader
        title="Review"
        pill={
          loading
            ? undefined
            : total === 0
              ? { label: 'All clear', tone: 'green' }
              : { label: `${total} waiting`, tone: 'accent' }
        }
        subtitle={loading ? undefined : subtitle}
      />

      <Segmented
        options={[
          { label: 'Posts', count: posts.length },
          { label: 'Music', count: music.length },
          { label: 'Accounts', count: accounts.length },
        ]}
        value={lane}
        onChange={setLane}
      />

      {loading ? (
        <View style={styles.list}>
          <SkeletonCard height={96} radius={radiusAdmin.lg} />
          <SkeletonCard height={96} radius={radiusAdmin.lg} />
          <SkeletonCard height={96} radius={radiusAdmin.lg} />
          <SkeletonCard height={96} radius={radiusAdmin.lg} />
        </View>
      ) : lane === 0 ? (
        posts.length === 0 ? (
          <EmptyState
            icon="circle-check-big"
            title="Nothing to review"
            body={
              inFlight > 0
                ? `${inFlight} posts are with creators. They land here the moment they're submitted.`
                : 'Submissions land here the moment a creator finishes recording.'
            }
            actionLabel="Open Calendar"
            onAction={() => router.navigate('/(admin)/(tabs)/calendar')}
            style={styles.empty}
          />
        ) : (
          <View style={styles.list}>
            {posts.map((row) => (
              <SubmissionRow
                key={row.item.id}
                item={row.item}
                attempt={row.attempt}
                thumbUri={null}
                unitCount={row.unitCount}
                onPress={() => router.push(`/(admin)/review/${row.item.id}`)}
              />
            ))}
            <Text style={styles.footerNote}>{FOOTER_NOTE}</Text>
          </View>
        )
      ) : lane === 1 ? (
        music.length === 0 ? (
          <EmptyState
            icon="music-2"
            title="No songs waiting"
            body="Slideshows land here when a creator marks the song added."
            style={styles.empty}
          />
        ) : (
          <View style={styles.list}>
            {music.map((item) => (
              <MusicApprovalRow
                key={item.assignment.id}
                item={item}
                busy={musicBusy === item.assignment.id}
                onApprove={() => void approveMusicItem(item.assignment.id)}
              />
            ))}
          </View>
        )
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="users"
          title="No accounts to approve"
          body="New creators land here when they submit their warm-up proof."
          style={styles.empty}
        />
      ) : (
        <View style={styles.list}>
          {pendingAccounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              onPress={() => openAccount(account.id)}
            />
          ))}
          {sentBackAccounts.length > 0 && (
            <>
              <SectionLabel style={styles.sectionLabel}>Sent back</SectionLabel>
              {sentBackAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onPress={() => openAccount(account.id)}
                />
              ))}
            </>
          )}
        </View>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 14,
    gap: 10,
  },
  sectionLabel: {
    marginTop: 10,
    marginBottom: 2,
  },
  footerNote: {
    marginTop: 4,
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate400,
    textAlign: 'center',
  },
  empty: {
    marginTop: 48,
  },
});
