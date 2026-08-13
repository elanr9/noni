import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { AccountRow } from '../../../components/admin/AccountRow';
import { MusicApprovalRow } from '../../../components/admin/MusicApprovalRow';
import {
  AdminHeader,
  AdminScreen,
  SectionLabel,
  Segmented,
  SkeletonCard,
  SkeletonLine,
} from '../../../components/admin/shared';
import { SubmissionRow } from '../../../components/admin/SubmissionRow';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
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

const SUBTITLE_DEFAULT = 'Approve posts and they will be posted automatically!';
const SUBTITLE_ONE_LEFT = "One to clear, then you're done for today.";
const SUBTITLE_CLEARED =
  'Everything is cleared. Creators are recording the rest of the week.';
const FOOTER_NOTE =
  'Reject a single clip and only that clip goes back. The rest stay approved.';
const MUSIC_INTRO =
  "Slideshows only. Open the post, check the song is on it, approve. Approval unlocks that post's earnings.";

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
} {
  const [posts, setPosts] = useState<SubmissionQueueRow[]>([]);
  const [music, setMusic] = useState<MusicApprovalItem[]>([]);
  const [accounts, setAccounts] = useState<AccountApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (companyId === undefined) return;
    try {
      const [queue, musicQueue, accountQueue] = await Promise.all([
        listAssignmentQueue(),
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

  return { posts, music, accounts, loading };
}

export default function ReviewScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { posts, music, accounts, loading } = useAdminQueue(profile?.company_id);
  const [lane, setLane] = useState(0);

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
        trailing={loading ? <SkeletonLine width={84} height={30} /> : undefined}
      />

      <Segmented
        options={[
          { label: 'Posts', count: loading ? undefined : posts.length },
          { label: 'Music', count: loading ? undefined : music.length },
          { label: 'Accounts', count: loading ? undefined : accounts.length },
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
            icon="inbox"
            title="Nothing to review"
            body="Creators are recording this week's posts. New submissions land here, newest first."
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
            body="Creators tap Music added once the track is on a live slideshow. It lands here."
            style={styles.empty}
          />
        ) : (
          <View style={styles.list}>
            <Text style={styles.musicIntro}>{MUSIC_INTRO}</Text>
            {music.map((item) => (
              <MusicApprovalRow
                key={item.assignment.id}
                item={item}
                onPress={() => router.push(`/(admin)/music/${item.assignment.id}`)}
              />
            ))}
          </View>
        )
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="circle-user-round"
          title="No accounts to approve"
          body="Every creator on the roster is linked. New creators show up here after they upload their warm-up proof."
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
  musicIntro: {
    marginTop: 2,
    marginHorizontal: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  footerNote: {
    marginTop: 6,
    marginHorizontal: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  empty: {
    marginTop: 40,
  },
});
