import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { Screen } from '../../../components/layout/Screen';
import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { TabBar } from '../../../components/ui/TabBar';
import { getSocialConnectUrl } from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { useSetupState, type SetupStepStatus } from '../../../lib/setup';
import { getStripeConnectUrl } from '../../../lib/wallet-api';
import type { TaskStatus } from '../../../lib/tasks';
import {
  borderWidth,
  color,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

type ChipView = {
  status: TaskStatus;
  label: string;
};

function chipForStep(
  status: SetupStepStatus,
  sentBackReason: string | null,
): ChipView {
  if (status === 'done') return { status: 'approved', label: 'Done' };
  if (status === 'in_review') return { status: 'submitted', label: 'In review' };
  if (sentBackReason !== null) {
    return { status: 'changes_requested', label: 'Sent back' };
  }
  return { status: 'assigned', label: 'To do' };
}

function StepRow({
  icon,
  title,
  sub,
  status,
  sentBackReason = null,
  busy = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  status: SetupStepStatus;
  sentBackReason?: string | null;
  busy?: boolean;
  onPress: () => void;
}) {
  const chip = chipForStep(status, sentBackReason);
  const emphasized =
    status === 'in_review' || (status === 'todo' && sentBackReason !== null);
  const iconBg =
    status === 'done'
      ? color.greenSoft
      : status === 'in_review' || sentBackReason !== null
        ? color.amberSoft
        : color.blue100;
  const iconColor =
    status === 'done'
      ? color.green
      : status === 'in_review' || sentBackReason !== null
        ? color.amber
        : color.blue700;
  const iconName: IconName =
    status === 'done'
      ? 'check'
      : status === 'in_review'
        ? 'clock'
        : sentBackReason !== null
          ? 'circle-alert'
          : icon;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={busy}
      onPress={onPress}
      style={[
        styles.card,
        shadow.shadowCard,
        emphasized && styles.cardEmphasized,
        busy && styles.cardBusy,
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
        <Icon name={iconName} size={16} color={iconColor} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        {sub !== undefined && sub.length > 0 ? (
          <Text style={styles.cardSub}>{sub}</Text>
        ) : null}
      </View>
      <StatusChip status={chip.status} label={chip.label} />
    </PressableScale>
  );
}

const TAB_ROUTES = [
  { key: 'index', name: 'index' },
  { key: 'posts', name: 'posts' },
  { key: 'analytics', name: 'analytics' },
  { key: 'profile', name: 'profile' },
] as const;

const TAB_HREFS: Record<(typeof TAB_ROUTES)[number]['name'], Href> = {
  index: '/(creator)/(tabs)',
  posts: '/(creator)/(tabs)/posts',
  analytics: '/(creator)/(tabs)/analytics',
  profile: '/(creator)/(tabs)/profile',
};

function LockedSetupTabBar() {
  const router = useRouter();
  const props = {
    state: {
      key: 'setup-tabs',
      // No tab selected while on the setup checklist.
      index: -1,
      routeNames: TAB_ROUTES.map((r) => r.name),
      routes: TAB_ROUTES.map((r) => ({
        key: r.key,
        name: r.name,
        params: undefined,
      })),
      history: [{ type: 'route' as const, key: 'index' }],
      type: 'tab' as const,
      stale: false as const,
    },
    descriptors: Object.fromEntries(
      TAB_ROUTES.map((r) => [
        r.key,
        {
          options: {},
          navigation: {} as BottomTabBarProps['descriptors'][string]['navigation'],
          route: { key: r.key, name: r.name, params: undefined },
          render: () => null,
        },
      ]),
    ),
    navigation: {
      emit: () => ({ defaultPrevented: false }),
      navigate: (name: string) => {
        const href = TAB_HREFS[name as keyof typeof TAB_HREFS];
        if (href !== undefined) router.push(href);
      },
    },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as BottomTabBarProps;

  return <TabBar {...props} />;
}

export default function SetupChecklistScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { state, refresh } = useSetupState(profile);
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

  const warmupSentBack =
    state !== null &&
    state.warmup === 'todo' &&
    state.accountReason !== null
      ? state.accountReason
      : null;

  const connectSub =
    state === null
      ? undefined
      : state.connect === 'done'
        ? undefined
        : state.instagramConnected
          ? 'Instagram is linked. TikTok still needs connecting.'
          : state.tiktokConnected
            ? 'TikTok is linked. Instagram still needs connecting.'
            : 'Link both accounts so we can post for you.';

  const warmupSub =
    state === null
      ? undefined
      : state.warmup === 'done'
        ? undefined
        : state.warmup === 'in_review'
          ? 'Warm up your accounts'
          : warmupSentBack !== null
            ? warmupSentBack
            : 'Warm up your accounts';

  const bankSub =
    state === null
      ? undefined
      : state.bank === 'done'
        ? undefined
        : 'Where your payouts land every Sunday at 8PM Eastern';

  type Cta = { label: string; onPress: () => void; busy?: boolean };
  let cta: Cta | null = null;
  if (state !== null && !state.complete) {
    if (state.accounts === 'todo') {
      cta = {
        label: 'Create accounts',
        onPress: () => router.push('/(creator)/account-setup' as Href),
      };
    } else if (state.connect === 'todo') {
      cta = {
        label: 'Connect accounts',
        onPress: () => void connectSocials(),
        busy: connectBusy,
      };
    } else if (state.warmup === 'todo') {
      cta = {
        label: warmupSentBack !== null ? 'Fix warm up' : 'Warm them up',
        onPress: () => router.push('/(creator)/setup/warmup' as Href),
      };
    } else if (state.bank === 'todo') {
      cta = {
        label: 'Connect your bank',
        onPress: () => void connectBank(),
        busy: bankBusy,
      };
    }
  }

  const footerCta =
    state?.complete ? (
      <Button
        size="lg"
        block
        onPress={() => router.replace('/(creator)/(tabs)' as Href)}
      >
        Go to Home
      </Button>
    ) : cta !== null ? (
      <Button
        size="lg"
        block
        disabled={cta.busy === true}
        onPress={cta.onPress}
      >
        {cta.label}
      </Button>
    ) : null;

  return (
    <View style={styles.root}>
      <Screen
        bg={color.offWhite}
        scroll
        contentStyle={styles.content}
        footer={
          footerCta !== null ? (
            <View style={styles.footerPad}>{footerCta}</View>
          ) : undefined
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Get set up</Text>
          <Text style={styles.subtitle}>
            Four steps and Home, Posts and Analytics unlock.
          </Text>
          {state !== null ? (
            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <ProgressBar progress={doneCount / 4} />
              </View>
              <Text style={styles.progressLabel}>
                {doneCount} of 4
              </Text>
            </View>
          ) : null}
        </View>

        {state === null ? (
          <View style={styles.skeletons}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonLine
                key={i}
                width="100%"
                height={space.tapPrimary + space[4]}
                radius={radius.lg}
              />
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            <StepRow
              icon="at-sign"
              title="Create accounts"
              status={state.accounts}
              onPress={() => router.push('/(creator)/account-setup' as Href)}
            />
            <StepRow
              icon="link"
              title="Connect accounts"
              sub={connectBusy ? 'Opening the connect flow' : connectSub}
              status={state.connect}
              busy={connectBusy}
              onPress={() => void connectSocials()}
            />
            <StepRow
              icon="flame"
              title="Warm them up"
              sub={warmupSub}
              status={state.warmup}
              sentBackReason={warmupSentBack}
              onPress={() => router.push('/(creator)/setup/warmup' as Href)}
            />
            <StepRow
              icon="dollar-sign"
              title="Connect your bank"
              sub={bankBusy ? 'Opening Stripe' : bankSub}
              status={state.bank}
              busy={bankBusy}
              onPress={() => void connectBank()}
            />
          </View>
        )}
      </Screen>
      <LockedSetupTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  content: {
    gap: space[6],
    paddingTop: space[3],
    paddingBottom: space[9],
  },
  footerPad: {
    // Floating locked TabBar (~68) + bottom offset (22), same as Home.
    paddingBottom: space.tapMin + space[11] + space[2],
  },
  header: {
    gap: space[3],
  },
  title: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  subtitle: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.stackGap,
    paddingTop: space[2],
  },
  progressBar: {
    flex: 1,
  },
  progressLabel: {
    fontSize: type.size.meta,
    fontWeight: type.weight.heavy,
    color: color.slate500,
  },
  list: {
    gap: space.stackGap,
  },
  skeletons: {
    gap: space.stackGap,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[4],
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: space.cardPad,
  },
  cardEmphasized: {
    borderColor: color.amber,
  },
  cardBusy: {
    opacity: 0.6,
  },
  cardIcon: {
    width: space[9],
    height: space[9],
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: space[2],
  },
  cardTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  cardSub: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate400,
  },
});
