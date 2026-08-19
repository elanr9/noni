import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useFocusEffect, useRouter, type Href } from 'expo-router';

import { Screen } from '../../../components/layout/Screen';
import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import { Wordmark } from '../../../components/ui/Wordmark';
import { useAuth } from '../../../lib/auth';
import { getCompany } from '../../../lib/onboarding';
import { useSetupState, type SetupState, type SetupStepStatus } from '../../../lib/setup';
import {
  borderWidth,
  color,
  motion,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

function inviteSeenKey(creatorId: string): string {
  return `noni.inviteSeen.${creatorId}`;
}

/**
 * Two visible steps. The real machine has three (accounts draft, socials
 * connect, warm-up review), so "Connect accounts" covers both the accounts
 * draft and the socials link: it reads done only when both are done, and
 * tapping it routes to whichever half is still open.
 */
type StepKey = 'accounts' | 'warmup';

type StepView = {
  key: StepKey;
  icon: IconName;
  title: string;
  sub: string;
  status: SetupStepStatus;
};

function connectSub(state: SetupState): string {
  if (state.accounts !== 'done') {
    return 'Save your handles, then link the apps so we can post for you.';
  }
  if (state.connect === 'done') return 'Instagram and TikTok are linked.';
  if (state.instagramConnected) return 'Instagram is linked. TikTok is left.';
  if (state.tiktokConnected) return 'TikTok is linked. Instagram is left.';
  return 'Link TikTok and Instagram so we can post for you.';
}

function stepViews(state: SetupState): StepView[] {
  return [
    {
      key: 'accounts',
      icon: 'link',
      title: 'Connect accounts',
      sub: connectSub(state),
      status:
        state.accounts === 'done' && state.connect === 'done' ? 'done' : 'todo',
    },
    {
      key: 'warmup',
      icon: 'zap',
      title: 'Warm up accounts',
      sub: 'Scroll and like for a few days so your accounts look human.',
      status: state.warmup,
    },
  ];
}

function StepPill({ status }: { status: SetupStepStatus }) {
  const tone =
    status === 'done'
      ? { bg: color.greenSoft, fg: color.green, label: 'Done' }
      : status === 'in_review'
        ? { bg: color.amberSoft, fg: color.amber, label: 'In review' }
        : { bg: color.blue100, fg: color.blue700, label: 'To do' };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

function StepCard({
  step,
  onPress,
}: {
  step: StepView;
  onPress: () => void;
}) {
  const done = step.status === 'done';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={step.title}
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <View
        style={[
          styles.cardIcon,
          done && { backgroundColor: color.greenSoft },
        ]}
      >
        <Icon
          name={done ? 'check' : step.icon}
          size={17}
          color={done ? color.green : color.blue700}
        />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{step.title}</Text>
        <Text style={styles.cardSub}>{step.sub}</Text>
      </View>
      <StepPill status={step.status} />
    </PressableScale>
  );
}

function InviteModal({
  visible,
  companyName,
  onAccept,
}: {
  visible: boolean;
  companyName: string;
  onAccept: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [visible, enter]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.scrim}>
        <Animated.View
          style={[
            styles.inviteCard,
            shadow.shadowRaised,
            {
              opacity: enter,
              transform: [
                {
                  translateY: enter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
                {
                  scale: enter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.97, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.inviteTile}>
            <Text style={styles.inviteTileText}>
              {companyName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.inviteTitle}>
            {`You've been invited to join ${companyName}'s team`}
          </Text>
          <Text style={styles.inviteBody}>
            {`You record, ${companyName} handles editing and posting.`}
          </Text>
          <View style={styles.inviteCta}>
            <Button size="lg" block onPress={onAccept}>
              Accept invite
            </Button>
          </View>
          <Text style={styles.inviteCaption}>Joining as a creator</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function CreatorSetupChecklist() {
  const router = useRouter();
  const { profile } = useAuth();
  const { state, refresh } = useSetupState(profile);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    let cancelled = false;
    void getCompany(companyId)
      .then((company) => {
        if (!cancelled) setCompanyName(company.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile?.company_id]);

  // F1: invites are claimed implicitly at sign-in (handle_new_user), so the
  // accept modal shows once per creator on their first landing here.
  useEffect(() => {
    const creatorId = profile?.id;
    if (!creatorId) return;
    let cancelled = false;
    void AsyncStorage.getItem(inviteSeenKey(creatorId))
      .then((seen) => {
        if (!cancelled && seen === null) setInviteOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const acceptInvite = () => {
    setInviteOpen(false);
    if (profile) {
      void AsyncStorage.setItem(inviteSeenKey(profile.id), 'true').catch(
        () => undefined,
      );
    }
  };

  const stepAction = (key: StepKey): void => {
    if (state === null) return;
    if (key === 'accounts') {
      router.push(
        (state.accounts !== 'done'
          ? '/(creator)/account-setup'
          : '/(creator)/setup/connect') as Href,
      );
      return;
    }
    router.push('/(creator)/setup/warmup' as Href);
  };

  const steps = state !== null ? stepViews(state) : [];
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const firstOpen = steps.find((s) => s.status === 'todo');

  const footer =
    firstOpen !== undefined ? (
      <View style={styles.footerPad}>
        <Button
          size="lg"
          block
          icon={firstOpen.icon}
          onPress={() => stepAction(firstOpen.key)}
        >
          {firstOpen.title}
        </Button>
      </View>
    ) : undefined;

  return (
    <>
      <Screen bg={color.offWhite} scroll contentStyle={styles.content} footer={footer}>
        <View style={styles.headerRow}>
          <Wordmark size={19} />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Open messages"
            onPress={() => router.push('/(creator)/messages' as Href)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="message-circle" size={23} color={color.ink} />
          </PressableScale>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Get set up</Text>
          <Text style={styles.subtitle}>Two steps and your queue unlocks.</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <ProgressBar progress={doneCount / 2} />
            </View>
            <Text style={styles.progressLabel}>{doneCount} of 2</Text>
          </View>
        </View>

        {state === null ? (
          <View style={styles.list}>
            {[0, 1].map((i) => (
              <SkeletonLine key={i} width="100%" height={92} radius={radius.lg} />
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            {steps.map((step) => (
              <StepCard
                key={step.key}
                step={step}
                onPress={() => stepAction(step.key)}
              />
            ))}
          </View>
        )}
      </Screen>

      <InviteModal
        visible={inviteOpen}
        companyName={companyName ?? 'Your company'}
        onAccept={acceptInvite}
      />
    </>
  );
}

export default function SetupRoute() {
  return <Redirect href="/(creator)/(tabs)" />;
}

const styles = StyleSheet.create({
  content: {
    gap: space[6],
    paddingTop: space[2],
    paddingBottom: space[9],
  },
  footerPad: {
    // Floating locked TabBar (~68) + bottom offset (22): CTA sits at ~96.
    paddingBottom: space.tapMin + space[11] + space[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    gap: space[2],
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
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  list: {
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
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  cardSub: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.snug,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  pillText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  scrim: {
    flex: 1,
    backgroundColor: color.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.gutter,
  },
  inviteCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: color.white,
    borderRadius: radius['2xl'],
    paddingTop: 30,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  inviteTile: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteTileText: {
    fontSize: 26,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  inviteTitle: {
    marginTop: space[4],
    fontSize: 24,
    lineHeight: 24 * 1.2,
    letterSpacing: -0.5,
    fontWeight: type.weight.bold,
    color: color.ink,
    textAlign: 'center',
  },
  inviteBody: {
    marginTop: space[2],
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: type.weight.regular,
    color: color.slate500,
    textAlign: 'center',
  },
  inviteCta: {
    alignSelf: 'stretch',
    marginTop: 22,
  },
  inviteCaption: {
    marginTop: space[3],
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
});
