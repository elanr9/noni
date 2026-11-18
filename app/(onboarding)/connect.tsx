import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';

import { InstagramFill, InstagramMark, Skeleton, TikTokMark } from '../../components/v2';
import { toast } from '../../components/v2/Toast';
import { getSocialConnectStatus, getSocialConnectUrl, type SocialConnectStatus } from '../../lib/admin-api';
import { parseSocialAccount, socialAccountSummary, type SocialAccountInfo } from '../../lib/social-accounts';
import { color, radius, shadow, space, text } from '../../theme/v2';
import { OnboardingShell, QuietButton } from './_shell';

// Same handshake as the creator Connect accounts screen: one Upload-Post link
// page covers both platforms, and the link lands a beat after the browser
// closes, so the step re-checks a few times.
const RETURN_URL = 'noni://social-connected';
const POLL_ATTEMPTS = 6;
const POLL_MS = 1500;

type Key = 'tiktok' | 'instagram';
const PLATFORMS: { key: Key; label: string }[] = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function accountsOf(status: SocialConnectStatus | null): Record<Key, SocialAccountInfo> {
  const raw = status?.social_accounts ?? {};
  return { tiktok: parseSocialAccount(raw.tiktok), instagram: parseSocialAccount(raw.instagram) };
}

function Mark({ k }: { k: Key }) {
  if (k === 'instagram') {
    return (
      <InstagramFill style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <InstagramMark size={20} />
      </InstagramFill>
    );
  }
  return (
    <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
      <TikTokMark size={20} />
    </View>
  );
}

function PlatformRow({ k, label, info, loading }: { k: Key; label: string; info: SocialAccountInfo; loading: boolean }) {
  const done = info.connected;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[4],
        minHeight: 72,
        backgroundColor: color.card,
        borderRadius: radius.option,
        borderWidth: 1.5,
        borderColor: done ? color.green : 'transparent',
        ...shadow.card,
      }}
    >
      <Mark k={k} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={text.row}>{label}</Text>
        {loading ? (
          <Skeleton h={14} w={120} r={6} style={{ marginTop: 4, marginBottom: 0, backgroundColor: color.grey1, boxShadow: 'none' }} />
        ) : (
          <Animated.Text entering={FadeIn.duration(200)} numberOfLines={1} style={[text.meta, { marginTop: 2 }]}>
            {done ? `${socialAccountSummary(info)} connected` : 'Not connected yet'}
          </Animated.Text>
        )}
      </View>
      {!loading ? (
        <View style={{ height: 26, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: done ? color.greenTint : color.grey1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: done ? color.green : color.grey4 }}>{done ? 'Linked' : 'To do'}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Step 4: link TikTok and Instagram. Skippable; Home keeps the checklist item until both are linked. */
export default function ConnectStep() {
  const [status, setStatus] = useState<SocialConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<SocialConnectStatus | null> => {
    try {
      const next = await getSocialConnectStatus();
      if (alive.current) {
        setStatus(next);
        setLoadFailed(false);
      }
      return next;
    } catch {
      if (alive.current) setLoadFailed(true);
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    getSocialConnectStatus()
      .then((next) => {
        if (alive.current) setStatus(next);
      })
      .catch(() => {
        if (alive.current) setLoadFailed(true);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
  }, []);

  const accounts = accountsOf(status);
  const linked = PLATFORMS.filter((p) => accounts[p.key].connected).length;
  const all = linked === PLATFORMS.length;
  const next = () => router.push('/(onboarding)/practice');

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await getSocialConnectUrl();
      await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
      for (let i = 0; i < POLL_ATTEMPTS && alive.current; i += 1) {
        const s = accountsOf(await load());
        if (s.tiktok.connected && s.instagram.connected) {
          toast.success('Both accounts are linked');
          break;
        }
        await wait(POLL_MS);
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `Could not open the link page. ${e.message}` : 'Could not open the link page. Try again.', {
        label: 'Retry',
        onPress: () => void connect(),
      });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={4}
      onBack={() => router.back()}
      title="Connect your accounts"
      subtitle="Approved posts go out on these. Nothing posts without your team's approval, and we never see your password."
      primaryLabel={all ? 'Next' : busy ? 'Waiting for the link' : linked ? 'Link the other one' : 'Link TikTok and Instagram'}
      primaryBusy={busy}
      primaryDisabled={loading}
      onPrimary={all ? next : () => void connect()}
      footerExtra={all ? undefined : <QuietButton label="Do this later" disabled={busy} onPress={next} />}
    >
      {PLATFORMS.map((p) => (
        <PlatformRow key={p.key} k={p.key} label={p.label} info={accounts[p.key]} loading={loading} />
      ))}
      {loadFailed && !loading ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <QuietButton
            label="Could not check your accounts. Tap to retry."
            onPress={() => {
              setLoading(true);
              void load();
            }}
          />
        </Animated.View>
      ) : null}
    </OnboardingShell>
  );
}
