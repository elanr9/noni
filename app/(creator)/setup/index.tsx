import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useFocusEffect, useRouter, type Href } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { LoadError } from '../../../components/creator/v2/LoadError';
import { CompanyMark } from '../../../components/shared/CompanyMark';
import { BellButton } from '../../../components/creator/v2/BellButton';
import { ContextRow, ElsewhereStrip } from '../../../components/shared';
import { Button, Card, Chip, Icon, Press, RootTitle, Screen, Sheet, Skeleton, type IconName } from '../../../components/v2';
import { retryAccountSubmission, useAccountSubmission } from '../../../lib/account-submission';
import { useAuth } from '../../../lib/auth';
import { useCompany } from '../../../lib/company-context';
import { getCompany } from '../../../lib/onboarding';
import { useSetupState, type SetupState, type SetupStepStatus } from '../../../lib/setup';
import { color, motion, radius, shadow, space, text, type Tone } from '../../../theme/v2';

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
  /** Only what is left when the step is half done. */
  sub: string | null;
  status: SetupStepStatus;
};

function connectSub(state: SetupState): string | null {
  if (state.accounts !== 'done' || state.connect === 'done') return null;
  if (state.instagramConnected) return 'Instagram is linked. TikTok is left.';
  if (state.tiktokConnected) return 'TikTok is linked. Instagram is left.';
  return null;
}

function stepViews(state: SetupState, submitting: boolean): StepView[] {
  // While the proof is still uploading there is no account row yet, so the
  // step would read "To do" even though the creator has already applied.
  const warmup: SetupStepStatus = submitting ? 'in_review' : state.warmup;
  return [
    {
      key: 'accounts',
      icon: 'link',
      title: 'Connect accounts',
      sub: connectSub(state),
      status: state.accounts === 'done' && state.connect === 'done' ? 'done' : 'todo',
    },
    {
      key: 'warmup',
      icon: 'bolt',
      title: 'Warm up accounts',
      sub: null,
      status: warmup,
    },
  ];
}

const STATUS: Record<SetupStepStatus, { tone: Tone; label: string }> = {
  done: { tone: 'green', label: 'Done' },
  in_review: { tone: 'amber', label: 'In review' },
  todo: { tone: 'blue', label: 'To do' },
};

function StepCard({ step, index, onPress }: { step: StepView; index: number; onPress: () => void }) {
  const s = STATUS[step.status];
  const t = s.tone === 'green' ? color.green : s.tone === 'amber' ? color.amber : color.blueDeep;
  const tint = s.tone === 'green' ? color.greenTint : s.tone === 'amber' ? color.amberTint : color.blueTint;
  const icon: IconName = step.status === 'done' ? 'check' : step.status === 'in_review' ? 'schedule' : step.icon;
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 60)}>
      <Card onPress={onPress} accessibilityLabel={`${step.title}, ${s.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={t} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={text.row}>{step.title}</Text>
          {step.sub ? <Text style={text.meta}>{step.sub}</Text> : null}
        </View>
        <Chip small tone={s.tone} label={s.label} />
      </Card>
    </Animated.View>
  );
}

function Progress({ value }: { value: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withTiming(value, { duration: motion.underline, easing: motion.ease }));
  }, [value, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: color.grey2, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: radius.pill, backgroundColor: color.blue }, fill]} />
    </View>
  );
}

export function CreatorSetupChecklist() {
  const router = useRouter();
  const { profile, activeCompany } = useAuth();
  const { openNotifications, unreadNotifications } = useCompany();
  const { state, refresh } = useSetupState(profile);
  const submission = useAccountSubmission();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const reload = useCallback(async () => {
    try {
      await refresh();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const companyId = profile?.active_company_id;
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
  }, [profile?.active_company_id]);

  // F1: invites are claimed implicitly at sign-in (handle_new_user), so the
  // accept sheet shows once per creator on their first landing here.
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
      void AsyncStorage.setItem(inviteSeenKey(profile.id), 'true').catch(() => undefined);
    }
  };

  const stepAction = (key: StepKey): void => {
    if (state === null) return;
    if (key === 'accounts') {
      router.push((state.accounts !== 'done' ? '/(creator)/account-setup' : '/(creator)/setup/connect') as Href);
      return;
    }
    router.push('/(creator)/setup/warmup' as Href);
  };

  const steps = state !== null ? stepViews(state, submission.status === 'sending') : [];
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const firstOpen = steps.find((s) => s.status === 'todo');
  const company = companyName ?? 'Your company';

  return (
    <>
      <Screen tabRoot>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: space[6] }}>
          <ContextRow right={<BellButton count={unreadNotifications} onPress={openNotifications} />} />
          <RootTitle
            title="Get set up"
            right={
              <Press
                accessibilityRole="button"
                accessibilityLabel="Open messages"
                onPress={() => router.push('/(creator)/chat' as Href)}
                style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', ...shadow.card }}
              >
                <Icon name="chat_bubble" size={19} color={color.ink} />
              </Press>
            }
          />
          <ElsewhereStrip style={{ marginTop: space[3] }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space[4], marginBottom: space[6] }}>
            <Progress value={doneCount / 2} />
            <Text style={[text.meta, { fontWeight: '700' }]}>{`${doneCount} of 2`}</Text>
          </View>

          {submission.status === 'failed' ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Press
                accessibilityRole="button"
                accessibilityLabel="Retry sending your application"
                onPress={retryAccountSubmission}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: space.cardGap, borderRadius: radius.card, backgroundColor: color.pinkTint }}
              >
                <Icon name="error" size={20} color={color.pink} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[text.body, { fontWeight: '700', color: color.pink }]}>Your application did not send</Text>
                  <Text style={[text.meta, { color: color.pink }]}>{submission.error ?? 'Tap to try again.'}</Text>
                </View>
                <Icon name="refresh" size={20} color={color.pink} />
              </Press>
            </Animated.View>
          ) : null}

          {state === null ? (
            failed ? (
              <LoadError
                title="Could not load your setup"
                retrying={retrying}
                onRetry={() => {
                  setRetrying(true);
                  void reload().finally(() => setRetrying(false));
                }}
              />
            ) : (
              <>
                <Skeleton h={92} />
                <Skeleton h={92} />
              </>
            )
          ) : (
            steps.map((step, i) => <StepCard key={step.key} step={step} index={i} onPress={() => stepAction(step.key)} />)
          )}
        </ScrollView>
        {firstOpen !== undefined ? (
          <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: 'row', paddingHorizontal: space.screen, paddingTop: space[2] }}>
            <Button icon={firstOpen.icon} label={firstOpen.title} onPress={() => stepAction(firstOpen.key)} />
          </Animated.View>
        ) : null}
      </Screen>

      <Sheet open={inviteOpen} onClose={acceptInvite} footer={<Button label="Accept invite" onPress={acceptInvite} />}>
        <View style={{ alignItems: 'center', paddingTop: 4 }}>
          {profile ? <CompanyMark companyId={profile.active_company_id} name={company} logoPath={activeCompany?.logoPath} size={64} /> : null}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[text.card, { fontSize: 24, lineHeight: 30, textAlign: 'center', alignSelf: 'stretch', marginTop: space[4] }]}>{`You've been invited to ${company}!`}</Text>
        </View>
      </Sheet>
    </>
  );
}

export default function SetupRoute() {
  return <Redirect href="/(creator)/(tabs)" />;
}
