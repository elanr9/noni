import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  DECISION_CHECKS,
  decideAccount,
  fetchAccountApprovalItem,
  signedVerificationUrl,
  type AccountApprovalItem,
  type AccountDecision,
} from '../../../lib/creator-accounts-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

type SignedUrls = {
  instagramRecording: string | null;
  tiktokRecording: string | null;
  instagramScreenshot: string | null;
  tiktokScreenshot: string | null;
};

function Recording({ label, uri }: { label: string; uri: string | null }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return (
    <View style={styles.assetBlock}>
      <Text style={styles.assetLabel}>{label}</Text>
      {uri !== null ? (
        <VideoView player={player} style={styles.recording} contentFit="cover" nativeControls />
      ) : (
        <View style={[styles.recording, styles.assetMissing]}>
          <Text style={styles.missingText}>Not uploaded</Text>
        </View>
      )}
    </View>
  );
}

function Screenshot({ label, uri }: { label: string; uri: string | null }) {
  return (
    <View style={styles.assetBlock}>
      <Text style={styles.assetLabel}>{label}</Text>
      {uri !== null ? (
        <Image source={{ uri }} style={styles.screenshot} resizeMode="cover" />
      ) : (
        <View style={[styles.screenshot, styles.assetMissing]}>
          <Text style={styles.missingText}>Not uploaded</Text>
        </View>
      )}
    </View>
  );
}

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
  const [checks, setChecks] = useState<AccountDecision>({
    instagram_recording_ok: false,
    tiktok_recording_ok: false,
    feed_is_niche: false,
    profile_matches_template: false,
  });
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  const decide = async (status: 'approved' | 'needs_changes') => {
    if (!profile || !account) return;
    if (status === 'needs_changes' && reason.trim().length === 0) {
      Alert.alert('Reason required', 'Tell the creator what to fix before resubmitting.');
      return;
    }
    setBusy(true);
    try {
      await decideAccount({
        companyId: profile.company_id,
        accountId: account.id,
        adminId: profile.id,
        status,
        reason: status === 'needs_changes' ? reason.trim() : null,
        decision: checks,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const allChecked = Object.values(checks).every(Boolean);
  const creatorName = account?.profiles?.full_name?.trim() || 'Creator';

  return (
    <>
      <Stack.Screen options={{ title: creatorName }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading || !account ? (
          <Text style={styles.empty}>Loading submission…</Text>
        ) : (
          <>
            <View style={[styles.card, shadow.shadowCard]}>
              <Text style={styles.cardLabel}>Handles</Text>
              <Text style={styles.handle}>
                TikTok {account.tiktok_handle ? `@${account.tiktok_handle}` : '—'}
              </Text>
              <Text style={styles.handle}>
                Instagram {account.instagram_handle ? `@${account.instagram_handle}` : '—'}
              </Text>
            </View>

            <Recording
              label="Instagram recording (home, explore, reels — 20s)"
              uri={urls.instagramRecording}
            />
            <Recording
              label="TikTok For You recording (15s minimum)"
              uri={urls.tiktokRecording}
            />
            <View style={styles.screenshotRow}>
              <Screenshot label="Instagram profile" uri={urls.instagramScreenshot} />
              <Screenshot label="TikTok profile" uri={urls.tiktokScreenshot} />
            </View>

            <View style={[styles.card, shadow.shadowCard]}>
              <Text style={styles.cardLabel}>Checks</Text>
              {DECISION_CHECKS.map((check) => {
                const on = checks[check.key];
                return (
                  <PressableScale
                    key={check.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      setChecks((prev) => ({ ...prev, [check.key]: !prev[check.key] }))
                    }
                    style={styles.checkRow}
                  >
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && <Icon name="check" size={13} color={color.white} />}
                    </View>
                    <Text style={styles.checkLabel}>{check.label}</Text>
                  </PressableScale>
                );
              })}
            </View>

            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="What needs to change (required to send back)"
              placeholderTextColor={color.slate400}
              multiline
            />

            <View style={styles.footerRow}>
              <Button
                variant="outline"
                size="md"
                block
                disabled={busy}
                style={styles.footerButton}
                onPress={() => void decide('needs_changes')}
              >
                Needs changes
              </Button>
              <Button
                variant="primary"
                size="md"
                icon="check"
                block
                disabled={busy || !allChecked}
                style={styles.footerButton}
                onPress={() => void decide('approved')}
              >
                Approve
              </Button>
            </View>
            {!allChecked && (
              <Text style={styles.hint}>
                Tick all four checks to approve. The decision is stored so it can
                become an automated review later.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, paddingVertical: 12, gap: 12, paddingBottom: 40 },
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
    gap: 8,
  },
  cardLabel: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  handle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  assetBlock: { gap: 6 },
  assetLabel: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  recording: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    backgroundColor: color.ink,
    overflow: 'hidden',
  },
  screenshotRow: { flexDirection: 'row', gap: 8 },
  screenshot: {
    flex: 1,
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    backgroundColor: color.fillQuiet,
  },
  assetMissing: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  missingText: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: color.blue600,
    borderColor: color.blue600,
  },
  checkLabel: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    lineHeight: 20,
  },
  reasonInput: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.size.bodySm,
    color: color.ink,
    textAlignVertical: 'top',
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  footerButton: { flex: 1 },
  hint: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: 18,
  },
});
