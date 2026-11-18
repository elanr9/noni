import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ConnectedSheet } from '../../../components/creator/v2/setup/ConnectedSheet';
import { PlatformBadge } from '../../../components/creator/v2/setup/PlatformBadge';
import { Notice, SetupLabel } from '../../../components/creator/v2/setup/SetupParts';
import { Button, Chip, Icon, Press, Screen, Sheet, Skeleton, type IconName } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import {
  disconnectSocialAccounts,
  getSocialConnectStatus,
  getSocialConnectUrl,
  type SocialConnectStatus,
} from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { refreshSetupState } from '../../../lib/setup';
import {
  parseSocialAccount,
  socialAccountSummary,
  type SocialAccountInfo,
} from '../../../lib/social-accounts';
import { color, radius, shadow, space, text } from '../../../theme/v2';

const PLATFORMS: { key: 'instagram' | 'tiktok'; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
];

const HOW_IT_WORKS: { icon: IconName; text: string }[] = [
  {
    icon: 'auto_awesome',
    text: 'You record. Noni edits, captions, and schedules the post for you.',
  },
  {
    icon: 'check',
    text: 'Nothing goes out until a campaign manager approves it.',
  },
  {
    icon: 'info',
    text: 'We never see your password, and you can unlink whenever you want.',
  },
];

// Upload-Post finishes the handshake a beat after the browser closes, so the
// screen re-checks a few times instead of asking the creator to pull to refresh.
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

/**
 * Instagram's consent page lives on www.instagram.com, which the Instagram app
 * claims as a universal link. SFSafariViewController (openBrowserAsync) honours
 * that claim, so the OAuth URL was being handed to the Instagram app, which
 * cannot render it and shows "Something went wrong". ASWebAuthenticationSession
 * keeps universal links inside the session, so the consent screen loads in the
 * browser where it belongs. TikTok never hit this because the TikTok app does
 * not claim its authorize path.
 */
const RETURN_URL = 'noni://social-connected';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accountsOf(
  status: SocialConnectStatus | null,
): Record<'instagram' | 'tiktok', SocialAccountInfo> {
  const raw = status?.social_accounts ?? {};
  return {
    instagram: parseSocialAccount(raw.instagram),
    tiktok: parseSocialAccount(raw.tiktok),
  };
}

function PlatformCard({
  platform,
  label,
  info,
  loading,
  index,
}: {
  platform: 'instagram' | 'tiktok';
  label: string;
  info: SocialAccountInfo;
  loading: boolean;
  index: number;
}) {
  const done = info.connected;
  return (
    <Animated.View
      entering={FadeInDown.duration(260).delay(index * 60)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginBottom: space.cardGap, borderRadius: radius.card, backgroundColor: color.card, ...shadow.card }}
    >
      <PlatformBadge platform={platform} size={44} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={text.row}>{label}</Text>
        {loading ? (
          <Skeleton w={120} h={14} r={7} style={{ marginBottom: 0, backgroundColor: color.grey1, boxShadow: 'none' }} />
        ) : (
          <Text numberOfLines={1} style={text.meta}>
            {socialAccountSummary(info)}
          </Text>
        )}
      </View>
      {loading ? null : done ? <Chip small tone="green" icon="check" label="Linked" /> : <Chip small tone="blue" label="To do" />}
    </Animated.View>
  );
}

export default function ConnectAccountsScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [status, setStatus] = useState<SocialConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  const alive = useRef(true);
  const celebrated = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<SocialConnectStatus | null> => {
    const next = await getSocialConnectStatus().catch(() => null);
    if (!alive.current) return next;
    if (next !== null) setStatus(next);
    setLoading(false);
    return next;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const accounts = accountsOf(status);
  const connectedCount = PLATFORMS.filter((p) => accounts[p.key].connected).length;
  const allConnected = connectedCount === PLATFORMS.length;

  useEffect(() => {
    if (!allConnected || celebrated.current) return;
    if (profile !== null) {
      void refreshSetupState(profile.active_company_id, profile.id).catch(() => undefined);
    }
    // Only a link that just happened deserves the celebration; arriving here
    // already connected should not replay it.
    celebrated.current = true;
    if (attempted) setCelebrating(true);
  }, [allConnected, attempted, profile]);

  const pollUntilLinked = useCallback(async () => {
    setChecking(true);
    try {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        const next = await load();
        if (!alive.current) return;
        const parsed = accountsOf(next);
        if (parsed.instagram.connected && parsed.tiktok.connected) return;
        await wait(POLL_INTERVAL_MS);
        if (!alive.current) return;
      }
    } finally {
      if (alive.current) setChecking(false);
    }
  }, [load]);

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await getSocialConnectUrl();
      setAttempted(true);
      await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
      await pollUntilLinked();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'We could not open the link screen. Try again in a moment.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disconnectSocialAccounts();
      if (!alive.current) return;
      setUnlinkOpen(false);
      toast.success('Accounts unlinked');
      celebrated.current = false;
      setAttempted(false);
      setStatus({ profile: null, social_accounts: {} });
      if (profile !== null) {
        void refreshSetupState(profile.active_company_id, profile.id).catch(() => undefined);
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'We could not unlink your accounts. Try again in a moment.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const finishCelebration = () => {
    setCelebrating(false);
    router.back();
  };

  const primaryLabel = busy
    ? 'Opening'
    : allConnected
      ? 'Change accounts'
      : connectedCount === 1
        ? 'Connect the other one'
        : 'Connect accounts';

  const footer = (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        <Button icon={allConnected ? 'swap_horiz' : 'link'} label={primaryLabel} disabled={busy || checking} onPress={() => void connect()} />
      </View>
      {!allConnected && attempted && !checking ? (
        <LinkButton label="Just linked it? Check again" onPress={() => void pollUntilLinked()} />
      ) : null}
      {allConnected ? <LinkButton label="Back to setup" onPress={() => router.back()} /> : null}
      {connectedCount > 0 && !checking ? (
        <LinkButton label="Unlink and connect different accounts" danger disabled={busy} onPress={() => setUnlinkOpen(true)} />
      ) : null}
    </View>
  );

  return (
    <>
      <Screen back title="Connect accounts" scroll footer={footer}>
        <Animated.View entering={FadeIn.duration(220)} style={{ paddingTop: space[2], paddingBottom: space[6], gap: space[2] }}>
          <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] }}>
            <Icon name="link" size={26} color={color.blueDeep} />
          </View>
          <Text style={text.title}>Connect your accounts</Text>
          <Text style={[text.body, { color: color.grey4 }]}>
            Link Instagram and TikTok once. After that every approved post publishes on its own.
          </Text>
        </Animated.View>

        {PLATFORMS.map((platform, i) => (
          <PlatformCard key={platform.key} platform={platform.key} label={platform.label} info={accounts[platform.key]} loading={loading} index={i} />
        ))}

        {!loading && !accounts.instagram.connected ? (
          <Notice
            tone="amber"
            icon="info"
            title="Instagram needs a professional account"
            body="In Instagram open Settings, then Account type and tools, then Switch to professional account and pick Creator."
          />
        ) : null}

        {checking ? <Notice tone="blue" icon="schedule" title="Waiting for the link to come back from Instagram and TikTok" /> : null}

        <SetupLabel>How it works</SetupLabel>
        <View style={{ backgroundColor: color.card, borderRadius: radius.card, paddingHorizontal: 16, ...shadow.card }}>
          {HOW_IT_WORKS.map((row, i) => (
            <View
              key={row.text}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: i < HOW_IT_WORKS.length - 1 ? 1 : 0, borderBottomColor: color.grey1 }}
            >
              <Icon name={row.icon} size={20} color={color.blueDeep} />
              <Text style={[text.body, { flex: 1 }]}>{row.text}</Text>
            </View>
          ))}
        </View>
      </Screen>

      <Sheet
        open={unlinkOpen}
        onClose={busy ? () => undefined : () => setUnlinkOpen(false)}
        title="Unlink your accounts?"
        footer={
          <>
            <Button variant="quiet" label="Keep linked" disabled={busy} onPress={() => setUnlinkOpen(false)} />
            <Button variant="ink" label={busy ? 'Unlinking' : 'Unlink'} disabled={busy} onPress={() => void disconnect()} />
          </>
        }
      >
        <Text style={[text.body, { color: color.grey4 }]}>
          Instagram and TikTok will be disconnected from Noni. You can link different accounts right after.
        </Text>
      </Sheet>

      <ConnectedSheet
        open={celebrating}
        instagramHandle={accounts.instagram.handle}
        tiktokHandle={accounts.tiktok.handle}
        onDone={finishCelebration}
      />
    </>
  );
}

function LinkButton({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={[text.meta, { fontWeight: '700', color: danger ? color.pink : color.grey4 }]}>{label}</Text>
    </Press>
  );
}
