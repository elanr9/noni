import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';

import { ConnectedCelebration } from '../../../components/creator/ConnectedCelebration';
import { Screen } from '../../../components/layout/Screen';
import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import {
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
import {
  borderWidth,
  color,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

const PLATFORMS: { key: 'instagram' | 'tiktok'; label: string; icon: IconName }[] = [
  { key: 'instagram', label: 'Instagram', icon: 'at-sign' },
  { key: 'tiktok', label: 'TikTok', icon: 'music-2' },
];

const HOW_IT_WORKS: { icon: IconName; text: string }[] = [
  {
    icon: 'sparkles',
    text: 'You record. Noni edits, captions, and schedules the post for you.',
  },
  {
    icon: 'check',
    text: 'Nothing goes out until a campaign manager approves it.',
  },
  {
    icon: 'key-round',
    text: 'We never see your password, and you can unlink whenever you want.',
  },
];

// Upload-Post finishes the handshake a beat after the browser closes, so the
// screen re-checks a few times instead of asking the creator to pull to refresh.
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

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
  label,
  icon,
  info,
  loading,
}: {
  label: string;
  icon: IconName;
  info: SocialAccountInfo;
  loading: boolean;
}) {
  const done = info.connected;
  return (
    <View
      style={[
        styles.platform,
        shadow.shadowCard,
        done && styles.platformDone,
      ]}
    >
      <View style={[styles.platformIcon, done && styles.platformIconDone]}>
        <Icon name={icon} size={20} color={done ? color.green : color.blue700} />
      </View>
      <View style={styles.platformText}>
        <Text style={styles.platformLabel}>{label}</Text>
        {loading ? (
          <SkeletonLine width={120} height={13} radius={6} />
        ) : (
          <Text numberOfLines={1} style={styles.platformSub}>
            {socialAccountSummary(info)}
          </Text>
        )}
      </View>
      {!loading &&
        (done ? (
          <View style={styles.chipDone}>
            <Icon name="check" size={13} color={color.green} strokeWidth={3} />
            <Text style={styles.chipDoneText}>Linked</Text>
          </View>
        ) : (
          <View style={styles.chipTodo}>
            <Text style={styles.chipTodoText}>To do</Text>
          </View>
        ))}
    </View>
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

  const alive = useRef(true);
  const celebrated = useRef(false);

  useEffect(() => {
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
      void refreshSetupState(profile.company_id, profile.id).catch(() => undefined);
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
      await WebBrowser.openBrowserAsync(url);
      await pollUntilLinked();
    } catch (e) {
      Alert.alert(
        'We could not open the link screen',
        e instanceof Error ? e.message : 'Try again in a moment.',
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const finishCelebration = () => {
    setCelebrating(false);
    router.back();
  };

  const footer = (
    <>
      {allConnected ? (
        <Button size="lg" block icon="check" onPress={() => router.back()}>
          Back to setup
        </Button>
      ) : (
        <Button
          size="lg"
          block
          icon="link"
          disabled={busy || checking}
          onPress={() => void connect()}
        >
          {busy
            ? 'Opening…'
            : connectedCount === 1
              ? 'Connect the other one'
              : 'Connect accounts'}
        </Button>
      )}
      {!allConnected && attempted && !checking && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Check again"
          onPress={() => void pollUntilLinked()}
          style={styles.recheck}
        >
          <Text style={styles.recheckText}>Just linked it? Check again</Text>
        </PressableScale>
      )}
    </>
  );

  return (
    <>
      <Screen bg={color.offWhite} scroll contentStyle={styles.content} footer={footer}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="link" size={24} color={color.blue700} />
          </View>
          <Text style={styles.title}>Connect your accounts</Text>
          <Text style={styles.subtitle}>
            Link Instagram and TikTok once. After that every approved post
            publishes on its own.
          </Text>
        </View>

        <View style={styles.list}>
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.key}
              label={platform.label}
              icon={platform.icon}
              info={accounts[platform.key]}
              loading={loading}
            />
          ))}
        </View>

        {checking && (
          <View style={styles.checking}>
            <Icon name="clock" size={16} color={color.blue700} />
            <Text style={styles.checkingText}>
              Waiting for the link to come back from Instagram and TikTok…
            </Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.infoLabel}>How it works</Text>
          <View style={styles.infoCard}>
            {HOW_IT_WORKS.map((row, i) => (
              <View
                key={row.text}
                style={[styles.infoRow, i < HOW_IT_WORKS.length - 1 && styles.infoRowBorder]}
              >
                <Icon name={row.icon} size={17} color={color.blue700} />
                <Text style={styles.infoText}>{row.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </Screen>

      <ConnectedCelebration
        visible={celebrating}
        instagramHandle={accounts.instagram.handle}
        tiktokHandle={accounts.tiktok.handle}
        onDone={finishCelebration}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[7],
    paddingTop: space[3],
  },
  hero: {
    gap: space[2],
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
  title: {
    fontSize: type.size.title,
    lineHeight: type.size.title * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  list: {
    gap: space.stackGap,
  },
  platform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: space.cardPad,
  },
  platformDone: {
    borderColor: color.greenSoft,
  },
  platformIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformIconDone: {
    backgroundColor: color.greenSoft,
  },
  platformText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  platformLabel: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  platformSub: {
    fontSize: type.size.meta,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  chipDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
  },
  chipDoneText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.green,
  },
  chipTodo: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  chipTodoText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  checking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: color.blue100,
    marginTop: -space[3],
  },
  checkingText: {
    flex: 1,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * type.leading.snug,
    fontWeight: type.weight.semibold,
    color: color.blue700,
  },
  info: {
    gap: space[2],
  },
  infoLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
    marginLeft: 2,
  },
  infoCard: {
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
  },
  infoRowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  infoText: {
    flex: 1,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.snug,
    fontWeight: type.weight.regular,
    color: color.ink,
  },
  recheck: {
    alignSelf: 'center',
    paddingVertical: space[2],
    paddingHorizontal: space[4],
  },
  recheckText: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
});
