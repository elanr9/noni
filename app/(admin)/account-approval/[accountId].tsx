import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { FeedTestCard, type FeedVerdict } from '../../../components/admin/approval/FeedTestCard';
import {
  ReasonPicker,
  REJECT_REASONS,
  type RejectReasonKey,
} from '../../../components/admin/approval/ReasonPicker';
import { ProofRow } from '../../../components/admin/approval/ProofRow';
import { ScreenshotRow } from '../../../components/admin/approval/ScreenshotRow';
import { AdminScreen, CreatorAvatar, PushHeader, SectionLabel } from '../../../components/admin/shared';
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
import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';

type SignedUrls = {
  instagramRecording: string | null;
  tiktokRecording: string | null;
  instagramScreenshot: string | null;
  tiktokScreenshot: string | null;
};

const STATUS_CHIP: Record<string, { label: string; fg: string; bg: string }> = {
  pending: { label: 'Pending', fg: color.amber, bg: color.amberSoft },
  needs_changes: { label: 'Needs changes', fg: color.amber, bg: color.amberSoft },
  approved: { label: 'Approved', fg: color.green, bg: color.greenSoft },
};

export default function AccountApprovalScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { profile } = useAuth();
  const [account, setAccount] = useState<AccountApprovalItem | null>(null);
  const [urls, setUrls] = useState<SignedUrls>({
    instagramRecording: null,
    tiktokRecording: null,
    instagramScreenshot: null,
    tiktokScreenshot: null,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [feedVerdict, setFeedVerdict] = useState<FeedVerdict | null>(null);
  const [showHandles, setShowHandles] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<RejectReasonKey[]>([]);
  const [note, setNote] = useState('');

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
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [profile, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onVerdict = (verdict: FeedVerdict) => {
    setFeedVerdict(verdict);
    if (verdict === 'wrong') {
      setRejecting(true);
      setShowHandles(false);
      setReasons((prev) => (prev.includes('feed') ? prev : [...prev, 'feed']));
    }
  };

  const decide = async (status: 'approved' | 'needs_changes') => {
    if (!profile || !account) return;

    let reason: string | null = null;
    if (status === 'needs_changes') {
      const labels = REJECT_REASONS.filter((r) => reasons.includes(r.key)).map(
        (r) => r.label,
      );
      const trimmed = note.trim();
      if (labels.length === 0 && trimmed.length === 0) {
        Alert.alert('Reason required', 'Pick a reason so the creator knows what to fix.');
        return;
      }
      reason =
        labels.length > 0
          ? `${labels.join(' \u00b7 ')}${trimmed.length > 0 ? ` \u2014 ${trimmed}` : ''}`
          : trimmed;
    }

    // The structured decision the checks table stores. Approval asserts the
    // proof; a send-back flips the booleans its reasons cover.
    const decision: AccountDecision =
      status === 'approved'
        ? {
            instagram_recording_ok: true,
            tiktok_recording_ok: true,
            feed_is_niche: true,
            profile_matches_template: true,
          }
        : {
            instagram_recording_ok: !reasons.includes('proof'),
            tiktok_recording_ok: !reasons.includes('proof'),
            feed_is_niche: feedVerdict !== 'wrong' && !reasons.includes('feed'),
            profile_matches_template: !reasons.includes('bio'),
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
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onApprovePress = () => {
    // First tap reveals the handles that get linked; the second confirms.
    if (!showHandles) {
      setShowHandles(true);
      setRejecting(false);
      return;
    }
    void decide('approved');
  };

  const onSendBackPress = () => {
    if (!rejecting) {
      setRejecting(true);
      setShowHandles(false);
      return;
    }
    void decide('needs_changes');
  };

  if (loading || !account) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={color.blue500} />
      </View>
    );
  }

  const creatorName = account.profiles?.full_name?.trim() || 'Creator';
  const chip = STATUS_CHIP[account.status] ?? STATUS_CHIP.pending;
  const decided = account.status === 'approved';

  return (
    <AdminScreen
      actionBar={
        decided ? undefined : (
          <View style={styles.footerRow}>
            <Button
              variant="outline"
              size="md"
              disabled={busy}
              style={styles.footerButton}
              onPress={onSendBackPress}
            >
              Send back
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="check"
              disabled={busy || feedVerdict !== 'ok'}
              style={styles.footerButton}
              onPress={onApprovePress}
            >
              Approve and link
            </Button>
          </View>
        )
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      <PushHeader title="Account approval" onBack={() => router.back()} />

      <View style={styles.creatorCard}>
        <CreatorAvatar uri={null} name={creatorName} size={46} />
        <View style={styles.creatorText}>
          <Text numberOfLines={1} style={styles.creatorName}>
            {creatorName}
          </Text>
          <Text numberOfLines={1} style={styles.creatorMeta}>
            {`Submitted ${formatAge(account.updated_at)}`}
          </Text>
        </View>
        <Text style={[styles.statusChip, { color: chip.fg, backgroundColor: chip.bg }]}>
          {chip.label}
        </Text>
      </View>

      {account.status === 'needs_changes' && account.reason !== null && (
        <View style={styles.sentBackCard}>
          <Text style={styles.sentBackTitle}>Sent back</Text>
          <Text style={styles.sentBackReason}>{account.reason}</Text>
        </View>
      )}

      <SectionLabel style={styles.sectionLabel}>Warm-up proof</SectionLabel>
      <View style={styles.stack}>
        <ProofRow
          label="Instagram scroll"
          requirement={'Home, explore and reels \u00b7 20s required'}
          uri={urls.instagramRecording}
        />
        <ProofRow
          label="TikTok For You"
          requirement={'For You feed \u00b7 15s minimum'}
          uri={urls.tiktokRecording}
        />
        <ScreenshotRow
          items={[
            { label: 'Instagram profile', uri: urls.instagramScreenshot },
            { label: 'TikTok profile', uri: urls.tiktokScreenshot },
          ]}
        />
      </View>

      <SectionLabel style={styles.sectionLabel}>The feed test</SectionLabel>
      <FeedTestCard verdict={feedVerdict} onVerdict={onVerdict} />

      {showHandles && (
        <>
          <SectionLabel style={styles.sectionLabel}>Handles to link</SectionLabel>
          <View style={styles.handlesCard}>
            <View style={styles.handleRow}>
              <Icon name="music-2" size={15} color={color.blue700} />
              <Text style={styles.handleText}>
                {account.tiktok_handle ? `@${account.tiktok_handle}` : 'No TikTok handle'}
              </Text>
            </View>
            <View style={styles.handleRow}>
              <Icon name="at-sign" size={15} color={color.blue700} />
              <Text style={styles.handleText}>
                {account.instagram_handle
                  ? `@${account.instagram_handle}`
                  : 'No Instagram handle'}
              </Text>
            </View>
            <Text style={styles.handleNote}>
              Captured on approval. Upload-Post cannot post to an unlinked account.
            </Text>
          </View>
        </>
      )}

      {rejecting && (
        <View style={styles.reasonBlock}>
          <ReasonPicker
            selected={reasons}
            note={note}
            onToggle={(key) =>
              setReasons((prev) =>
                prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
              )
            }
            onNote={setNote}
          />
        </View>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.offWhite,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  creatorText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  creatorName: {
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  creatorMeta: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  statusChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    overflow: 'hidden',
  },
  sentBackCard: {
    marginTop: 10,
    gap: 4,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.amberSoft,
  },
  sentBackTitle: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.label,
    color: color.amber,
    textTransform: 'uppercase',
  },
  sentBackReason: {
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
  },
  stack: {
    gap: 8,
  },
  handlesCard: {
    gap: 10,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.blue50,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  handleText: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  handleNote: {
    fontSize: type.size.label,
    lineHeight: type.size.label * 1.4,
    fontWeight: type.weight.semibold,
    color: color.blue700,
  },
  reasonBlock: {
    marginTop: 18,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
  },
});
