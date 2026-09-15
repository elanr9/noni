import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { ContextRow, ElsewhereStrip, WaitBadge } from '../../../components/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import {
  latestSubmissionsByAssignment,
  submissionThumbPath,
  listAssignmentQueue,
  listMusicApprovalQueue,
  type MusicApprovalItem,
} from '../../../lib/admin-api';
import {
  listAccountApprovalQueue,
  type AccountApprovalItem,
} from '../../../lib/creator-accounts-api';
import { useAuth } from '../../../lib/auth';
import { useCompany } from '../../../lib/company-context';
import { toAssignmentQueueRow } from '../../../lib/admin-queue-map';
import type { MockQueueItem } from '../../../lib/admin-review-types';
import { color, radiusAdmin, shadow, space } from '../../../theme/tokens';

/** Clears the floating tab bar (22 bottom + bar height). */
const LIST_BOTTOM_PAD = 104;

function BellButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      onPress={onPress}
      style={[styles.bell, shadow.shadowCard]}
    >
      <Icon name="bell" size={19} color={color.ink} />
      {count > 0 && (
        <View style={styles.bellBadge}>
          <WaitBadge count={count} size={18} />
        </View>
      )}
    </PressableScale>
  );
}

/** MockQueueItem plus the media-badge facts the row spec needs. */
type SubmissionQueueRow = {
  item: MockQueueItem;
  /** submissions.version — attempt lives on the submission. */
  attempt: number;
  /** hook + points + outro, from the brief. Null when the brief has no count. */
  unitCount: number | null;
  /** Latest submission's first media path for the row thumb. */
  mediaPath: string | null;
};

function useAdminQueue(companyId: string | undefined): {
  posts: SubmissionQueueRow[];
  music: MusicApprovalItem[];
  /** assignment id -> slide 1 path, for music rows. */
  musicMedia: Map<string, string>;
  accounts: AccountApprovalItem[];
  loading: boolean;
} {
  const [posts, setPosts] = useState<SubmissionQueueRow[]>([]);
  const [music, setMusic] = useState<MusicApprovalItem[]>([]);
  const [musicMedia, setMusicMedia] = useState<Map<string, string>>(new Map());
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
      const subs = await latestSubmissionsByAssignment([
        ...queue.map((a) => a.id),
        ...musicQueue.map((m) => m.assignment.id),
      ]);
      setPosts(
        queue.map((a) => {
          const submission = subs.get(a.id) ?? null;
          return {
            item: toAssignmentQueueRow(a, submission),
            attempt: submission?.version ?? 1,
            unitCount: a.briefs.point_count !== null ? a.briefs.point_count + 2 : null,
            mediaPath: submission ? submissionThumbPath(submission) : null,
          };
        }),
      );
      setMusic(musicQueue);
      setMusicMedia(
        new Map(
          musicQueue.flatMap((m) => {
            const path = subs.get(m.assignment.id)?.video_path;
            return path !== undefined ? [[m.assignment.id, path] as const] : [];
          }),
        ),
      );
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

  return { posts, music, musicMedia, accounts, loading };
}

export default function ReviewScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { openNotifications, unreadNotifications } = useCompany();
  const { posts, music, musicMedia, accounts, loading } = useAdminQueue(profile?.active_company_id);
  const [lane, setLane] = useState(0);

  const pendingAccounts = accounts.filter((a) => a.status !== 'needs_changes');
  const sentBackAccounts = accounts.filter((a) => a.status === 'needs_changes');

  const total = posts.length + music.length + pendingAccounts.length;

  const openAccount = (accountId: string) =>
    router.push({
      pathname: '/(admin)/account-approval/[accountId]',
      params: { accountId },
    });

  return (
    <AdminScreen scroll={false} contentStyle={styles.screen}>
      <View>
        <ContextRow
          right={<BellButton count={unreadNotifications} onPress={openNotifications} />}
        />
        <AdminHeader
          title="Review"
          pill={
            loading
              ? undefined
              : total === 0
                ? { label: 'All clear', tone: 'green' }
                : { label: `${total} waiting`, tone: 'accent' }
          }
          trailing={loading ? <SkeletonLine width={84} height={30} /> : undefined}
        />
        <ElsewhereStrip style={styles.strip} />
        <Segmented
          options={[
            { label: 'Posts', count: loading ? undefined : posts.length },
            { label: 'Music', count: loading ? undefined : music.length },
            { label: 'Accounts', count: loading ? undefined : pendingAccounts.length },
          ]}
          value={lane}
          onChange={setLane}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <>
            <SkeletonCard height={96} radius={radiusAdmin.lg} />
            <SkeletonCard height={96} radius={radiusAdmin.lg} />
            <SkeletonCard height={96} radius={radiusAdmin.lg} />
            <SkeletonCard height={96} radius={radiusAdmin.lg} />
          </>
        ) : lane === 0 ? (
          posts.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="Nothing to review"
              body="Nothing from your creators right now."
              style={styles.empty}
            />
          ) : (
            posts.map((row) => (
              <SubmissionRow
                key={row.item.id}
                item={row.item}
                attempt={row.attempt}
                mediaPath={row.mediaPath}
                unitCount={row.unitCount}
                onPress={() => router.push(`/(admin)/review/${row.item.id}`)}
              />
            ))
          )
        ) : lane === 1 ? (
          music.length === 0 ? (
            <EmptyState
              icon="music-2"
              title="No songs waiting"
              body="Nothing from your creators right now."
              style={styles.empty}
            />
          ) : (
            music.map((item) => (
              <MusicApprovalRow
                key={item.assignment.id}
                item={item}
                mediaPath={musicMedia.get(item.assignment.id) ?? null}
                onPress={() => router.push(`/(admin)/music/${item.assignment.id}`)}
              />
            ))
          )
        ) : accounts.length === 0 ? (
          <EmptyState
            icon="circle-user-round"
            title="No accounts to approve"
            body="Every creator on the roster is linked."
            style={styles.empty}
          />
        ) : (
          <>
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
          </>
        )}
      </ScrollView>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space.gutterAdmin,
  },
  strip: {
    marginBottom: 14,
  },
  scroll: {
    flex: 1,
    marginTop: 14,
    marginHorizontal: -space.gutterAdmin,
  },
  list: {
    gap: 12,
    paddingHorizontal: space.gutterAdmin,
    paddingBottom: LIST_BOTTOM_PAD,
  },
  sectionLabel: {
    marginTop: 10,
    marginBottom: 2,
  },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  empty: {
    marginTop: 30,
  },
});
