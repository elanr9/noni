import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { PartCard, type AccountPart, type PartKey } from '../../../components/admin/approval/PartCard';
import { PartSheet } from '../../../components/admin/approval/PartSheet';
import {
  AdminScreen,
  Avatar,
  Card,
  ConfirmationTakeover,
  EmptyState,
  PushHeader,
  SkeletonCard,
  TypeChip,
} from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import { formatAge } from '../../../lib/admin-queue-map';
import {
  decideAccount,
  fetchAccountApprovalItem,
  signedVerificationUrl,
  type AccountApprovalItem,
  type AccountDecision,
} from '../../../lib/creator-accounts-api';
import { color, space, type } from '../../../theme/tokens';

type SignedUrls = {
  instagramRecording: string | null;
  tiktokRecording: string | null;
  instagramScreenshot: string | null;
  tiktokScreenshot: string | null;
};

const EMPTY_URLS: SignedUrls = {
  instagramRecording: null,
  tiktokRecording: null,
  instagramScreenshot: null,
  tiktokScreenshot: null,
};

const GRID_GAP = 8;

export default function AccountApprovalScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { profile } = useAuth();
  const { width: winWidth } = useWindowDimensions();
  const cardWidth = (winWidth - space.gutterAdmin * 2 - GRID_GAP) / 2;

  const [account, setAccount] = useState<AccountApprovalItem | null>(null);
  const [urls, setUrls] = useState<SignedUrls>(EMPTY_URLS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [notes, setNotes] = useState<Partial<Record<PartKey, string>>>({});
  const [openKey, setOpenKey] = useState<PartKey | null>(null);
  const [phase, setPhase] = useState<'approved' | 'sent' | null>(null);

  const load = useCallback(async () => {
    if (!profile || !accountId) return;
    try {
      const row = await fetchAccountApprovalItem(profile.company_id, accountId);
      const sign = (path: string | null) =>
        path !== null ? signedVerificationUrl(path).catch(() => null) : Promise.resolve(null);
      const [instagramRecording, tiktokRecording, instagramScreenshot, tiktokScreenshot] =
        await Promise.all([
          sign(row.instagram_recording_path),
          sign(row.tiktok_recording_path),
          sign(row.instagram_screenshot_path),
          sign(row.tiktok_screenshot_path),
        ]);
      setAccount(row);
      setUrls({ instagramRecording, tiktokRecording, instagramScreenshot, tiktokScreenshot });
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [profile, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const parts = useMemo<AccountPart[]>(() => {
    const handleList = [account?.tiktok_handle, account?.instagram_handle]
      .filter((h): h is string => typeof h === 'string' && h.length > 0)
      .map((h) => `@${h}`);
    return [
      { key: 'ig', label: 'Instagram scroll', meta: '20s: home, explore, reels', kind: 'clip' },
      { key: 'tt', label: 'TikTok For You scroll', meta: '15s minimum, continuous', kind: 'clip' },
      { key: 'shots', label: 'Profile screenshots', meta: 'Both platforms, bio visible', kind: 'shots' },
      { key: 'feed', label: 'Feed test', meta: 'For You is college soccer', kind: 'feed' },
      {
        key: 'handles',
        label: 'Handles to link',
        meta: handleList.length > 0 ? handleList.join(' \u00b7 ') : 'Not set',
        kind: 'handles',
      },
    ];
  }, [account]);

  const openPart = openKey === null ? null : (parts.find((p) => p.key === openKey) ?? null);
  const count = Object.keys(notes).length;

  const decide = useCallback(
    async (status: 'approved' | 'needs_changes') => {
      if (!profile || !account) return;

      const reason =
        status === 'needs_changes'
          ? parts
              .filter((p) => notes[p.key] !== undefined)
              .map((p) => `${p.label}: ${notes[p.key] ?? ''}`)
              .join('\n')
          : null;

      const decision: AccountDecision =
        status === 'approved'
          ? {
              instagram_recording_ok: true,
              tiktok_recording_ok: true,
              feed_is_niche: true,
              profile_matches_template: true,
            }
          : {
              instagram_recording_ok: notes.ig === undefined,
              tiktok_recording_ok: notes.tt === undefined,
              feed_is_niche: notes.feed === undefined,
              profile_matches_template: notes.shots === undefined,
            };

      setBusy(true);
      try {
        await decideAccount({
          companyId: profile.company_id,
          accountId: account.id,
          adminId: profile.id,
          status,
          reason,
          decision,
        });
        setPhase(status === 'approved' ? 'approved' : 'sent');
      } catch (e) {
        Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
      } finally {
        setBusy(false);
      }
    },
    [profile, account, parts, notes],
  );

  if (loading) {
    return (
      <AdminScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <PushHeader title="Account approval" onBack={() => router.back()} />
        <View style={styles.stack}>
          <SkeletonCard height={74} />
          <SkeletonCard height={18} radius={8} style={styles.hintSkeleton} />
          <View style={styles.grid}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} height={122} style={{ width: cardWidth }} />
            ))}
          </View>
        </View>
      </AdminScreen>
    );
  }

  if (account === null) {
    return (
      <AdminScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <PushHeader title="Account approval" onBack={() => router.back()} />
        <EmptyState
          icon="circle-alert"
          title="Could not load this submission"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setLoading(true);
            void load();
          }}
        />
      </AdminScreen>
    );
  }

  const creatorName = account.profiles?.full_name?.trim() || 'Creator';
  const short = creatorName.includes(' ')
    ? creatorName.slice(0, creatorName.indexOf(' '))
    : creatorName;
  const sentBack = account.status === 'needs_changes';
  const decided = account.status === 'approved';

  if (phase !== null) {
    return (
      <View style={styles.takeover}>
        <Stack.Screen options={{ headerShown: false }} />
        {phase === 'approved' ? (
          <ConfirmationTakeover
            icon="check"
            tone="good"
            title={`${short} is approved`}
            body={`@${account.tiktok_handle ?? ''} and @${account.instagram_handle ?? ''} are linked. Their first brief lands tomorrow morning.`}
            actionLabel="Back to Review"
            onAction={() => router.back()}
          />
        ) : (
          <ConfirmationTakeover
            icon="circle-alert"
            tone="warn"
            title={`Sent back to ${short}`}
            body="They see your notes on their setup screen and resubmit. It lands back in this queue."
            actionLabel="Back to Review"
            onAction={() => router.back()}
          />
        )}
      </View>
    );
  }

  return (
    <AdminScreen
      actionBar={
        decided ? undefined : (
          <View style={styles.footerRow}>
            <Button
              variant="outline"
              size="md"
              disabled={busy || count === 0}
              onPress={() => void decide('needs_changes')}
              style={styles.sendBack}
            >
              {count === 0 ? 'Send back' : `Send back \u00b7 ${count}`}
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="check"
              block
              disabled={busy}
              onPress={() => void decide('approved')}
              style={styles.approve}
            >
              Approve and link
            </Button>
          </View>
        )
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      <PushHeader
        title="Account approval"
        subtitle={
          sentBack
            ? `Sent back ${formatAge(account.updated_at)}`
            : `Submitted ${formatAge(account.updated_at)}`
        }
        onBack={() => router.back()}
      />

      <View style={styles.stack}>
        <Card pad={14} style={styles.creatorCard}>
          <Avatar uri={null} name={creatorName} size={46} />
          <View style={styles.creatorText}>
            <Text numberOfLines={1} style={styles.creatorName}>
              {creatorName}
            </Text>
          </View>
          <TypeChip tone={decided ? 'good' : sentBack ? 'warn' : 'quiet'}>
            {decided ? 'Approved' : sentBack ? 'Needs changes' : 'Pending'}
          </TypeChip>
        </Card>

        {sentBack && account.reason !== null && (
          <Card pad={13} style={styles.sentBackCard}>
            <View style={styles.sentBackRow}>
              <View style={styles.sentBackIcon}>
                <Icon name="circle-alert" size={16} color={color.amber} />
              </View>
              <Text style={styles.sentBackText}>{account.reason}</Text>
            </View>
          </Card>
        )}

        <Text style={styles.hint}>
          Tap a part to check it. Request changes on anything that is wrong, the rest
          counts as approved.
        </Text>

        <View style={styles.grid}>
          {parts.map((p) => (
            <PartCard
              key={p.key}
              part={p}
              noted={notes[p.key] !== undefined}
              width={cardWidth}
              onPress={() => setOpenKey(p.key)}
            />
          ))}
        </View>
      </View>

      <PartSheet
        part={openPart}
        onClose={() => setOpenKey(null)}
        creatorShort={short}
        urls={urls}
        accountHandles={{
          tiktok: account.tiktok_handle,
          instagram: account.instagram_handle,
        }}
        notes={notes}
        onSaveNote={(key, text) => setNotes((prev) => ({ ...prev, [key]: text }))}
        onRemoveNote={(key) =>
          setNotes((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  takeover: {
    flex: 1,
    backgroundColor: color.white,
  },
  stack: {
    gap: 12,
  },
  hintSkeleton: {
    width: '86%',
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creatorText: {
    flex: 1,
    minWidth: 0,
  },
  creatorName: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    letterSpacing: -0.3,
    color: color.ink,
  },
  sentBackCard: {
    backgroundColor: color.amberSoft,
    borderColor: color.amberSoft,
  },
  sentBackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  sentBackIcon: {
    marginTop: 1,
  },
  sentBackText: {
    flex: 1,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.semibold,
    color: color.amber,
  },
  hint: {
    marginHorizontal: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    color: color.slate500,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sendBack: {
    flexBasis: '47%',
    flexGrow: 0,
  },
  approve: {
    flex: 1,
  },
});
