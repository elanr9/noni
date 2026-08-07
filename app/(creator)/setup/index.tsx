import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import { getSocialConnectUrl } from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { useSetupState, type SetupStepStatus } from '../../../lib/setup';
import { getStripeConnectUrl } from '../../../lib/wallet-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

const CHIP: Record<SetupStepStatus, { label: string; fg: string; bg: string }> = {
  todo: { label: 'To do', fg: color.blue700, bg: color.blue100 },
  in_review: { label: 'In review', fg: color.amber, bg: color.amberSoft },
  done: { label: 'Done', fg: color.green, bg: color.greenSoft },
};

function StepChip({ status }: { status: SetupStepStatus }) {
  const c = CHIP[status];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={[styles.chipText, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

function StepCard({
  icon,
  title,
  sub,
  status,
  busy = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  sub: string;
  status: SetupStepStatus;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={busy}
      onPress={onPress}
      style={[styles.card, shadow.shadowCard, busy && styles.cardBusy]}
    >
      <View
        style={[
          styles.cardIcon,
          { backgroundColor: status === 'done' ? color.greenSoft : color.blue100 },
        ]}
      >
        <Icon
          name={status === 'done' ? 'check' : icon}
          size={19}
          color={status === 'done' ? color.green : color.blue700}
        />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{sub}</Text>
      </View>
      <StepChip status={status} />
      <Icon name="chevron-right" size={17} color={color.slate300} />
    </PressableScale>
  );
}

export default function SetupChecklistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { state, refresh } = useSetupState(profile);
  const [refreshing, setRefreshing] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const connectSocials = async () => {
    setConnectBusy(true);
    try {
      const url = await getSocialConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      await refresh();
    } catch (e) {
      Alert.alert('Connect failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setConnectBusy(false);
    }
  };

  const connectBank = async () => {
    setBankBusy(true);
    try {
      const url = await getStripeConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      await refresh();
    } catch (e) {
      Alert.alert('Setup failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBankBusy(false);
    }
  };

  const doneCount = state
    ? [state.accounts, state.connect, state.warmup, state.bank].filter(
        (s) => s === 'done',
      ).length
    : 0;

  const connectSub = !state
    ? ''
    : state.connect === 'done'
      ? 'TikTok and Instagram are linked.'
      : state.instagramConnected
        ? 'Instagram is linked. TikTok still needs connecting.'
        : state.tiktokConnected
          ? 'TikTok is linked. Instagram still needs connecting.'
          : 'Link both accounts so we can post for you.';

  const warmupSub = !state
    ? ''
    : state.warmup === 'done'
      ? 'Approved. Your accounts are cleared.'
      : state.warmup === 'in_review'
        ? 'Proof submitted. We are reviewing it now.'
        : state.accountReason !== null
          ? `Sent back: ${state.accountReason}`
          : 'Teach the apps who you are, then prove it.';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={styles.title}>Get set up</Text>
      <Text style={styles.subtitle}>
        Four steps and you start earning. We review your work along the way.
      </Text>
      {state !== null && (
        <Text style={styles.progress}>{doneCount} of 4 done</Text>
      )}

      {state === null ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonLine key={i} width="100%" height={74} radius={radius.md} />
          ))}
        </View>
      ) : (
        <>
          {state.complete && (
            <View style={styles.doneCard}>
              <Icon name="circle-check-big" size={22} color={color.green} />
              <View style={styles.doneText}>
                <Text style={styles.doneTitle}>You are all set</Text>
                <Text style={styles.doneBody}>
                  Setup is complete. Your first posts are waiting.
                </Text>
              </View>
              <Button
                size="sm"
                variant="approve"
                onPress={() => router.replace('/(creator)/(tabs)' as Href)}
              >
                Go
              </Button>
            </View>
          )}

          <StepCard
            icon="at-sign"
            title="Create your accounts"
            sub={
              state.accounts === 'done'
                ? 'Handles and screenshots saved. Tap to review.'
                : 'Fresh TikTok and Instagram, matched to our template.'
            }
            status={state.accounts}
            onPress={() => router.push('/(creator)/account-setup' as Href)}
          />
          <StepCard
            icon="link"
            title="Connect your accounts"
            sub={connectBusy ? 'Opening the connect flow…' : connectSub}
            status={state.connect}
            busy={connectBusy}
            onPress={() => void connectSocials()}
          />
          <StepCard
            icon="flame"
            title="Warm them up"
            sub={warmupSub}
            status={state.warmup}
            onPress={() => router.push('/(creator)/setup/warmup' as Href)}
          />
          <StepCard
            icon="dollar-sign"
            title="Connect your bank"
            sub={
              bankBusy
                ? 'Opening Stripe…'
                : state.bank === 'done'
                  ? 'Payouts go straight to your bank.'
                  : 'A quick Stripe setup so we can pay you.'
            }
            status={state.bank}
            busy={bankBusy}
            onPress={() => void connectBank()}
          />
        </>
      )}

      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/(creator)/chat' as Href)}
        style={styles.helpRow}
      >
        <Icon name="message-circle" size={17} color={color.slate500} />
        <Text style={styles.helpText}>Questions? Chat with the team</Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: {
    paddingHorizontal: space.gutter,
    paddingBottom: 48,
    gap: 10,
  },
  title: {
    fontSize: type.size.title,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: 21,
  },
  progress: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 2,
  },
  skeletons: { gap: 10, marginTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 14,
  },
  cardBusy: { opacity: 0.6 },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  cardSub: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: 18,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: type.size.micro11,
    fontWeight: '700',
  },
  doneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.greenSoft,
    borderRadius: radius.md,
    padding: 14,
  },
  doneText: { flex: 1, gap: 2 },
  doneTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.green,
  },
  doneBody: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.ink,
    lineHeight: 18,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 6,
  },
  helpText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
});
