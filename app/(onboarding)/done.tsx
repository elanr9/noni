import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/v2';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import { useCompanyNiche } from '../../lib/company-copy-api';
import { loadWaitingWork, talkSeconds, type WaitingWork } from '../../lib/creator-onboarding';
import { clearOnboardingAnswers, completeOnboarding } from '../../lib/onboarding';
import { color, motion, radius, space, text } from '../../theme/v2';
import { PrimaryButton, QuietButton } from './_shell';

type Load = { kind: 'loading' } | { kind: 'ready'; work: WaitingWork } | { kind: 'failed' };

function copyFor(work: WaitingWork | null, company: string): { title: string; body: string; cta: string } {
  const team = company ? `${company}'s team` : 'Your team';
  if (work && work.tasks > 0) {
    const what = work.firstTitle ? `"${work.firstTitle}"` : 'Your first post';
    const length = work.firstWords ? `, about ${talkSeconds(work.firstWords)} seconds of talking` : '';
    return {
      title: work.tasks === 1 ? 'One task is waiting' : `${work.tasks} tasks are waiting`,
      body: `${what} is ready${length}. The script is written.`,
      cta: 'Open Home',
    };
  }
  if (work && work.briefs > 0) {
    return {
      title: "You're in",
      body: `${team} shared ${work.briefs === 1 ? 'a brief' : `${work.briefs} briefs`} to record. Tap Create on Home to start one.`,
      cta: 'Open Home',
    };
  }
  return {
    title: "You're in",
    body: `${team} will send your first brief soon. We will let you know when it lands.`,
    cta: 'Open Home',
  };
}

/** Finish: what is waiting, then onboarding completes and Home opens. */
export default function DoneScreen() {
  const insets = useSafeAreaInsets();
  const { session, profile, refreshProfile } = useAuth();
  const niche = useCompanyNiche();
  const [state, setState] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;

  const fetchWork = useCallback(
    (): Promise<Load> =>
      !companyId || !meId
        ? Promise.resolve({ kind: 'ready', work: { tasks: 0, firstTitle: null, firstWords: null, briefs: 0 } })
        : loadWaitingWork(companyId, meId).then(
            (work): Load => ({ kind: 'ready', work }),
            (): Load => ({ kind: 'failed' }),
          ),
    [companyId, meId],
  );

  useEffect(() => {
    let live = true;
    void fetchWork().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [fetchWork]);

  const read = () => {
    setState({ kind: 'loading' });
    void fetchWork().then(setState);
  };

  const finish = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await completeOnboarding(session.user.id);
      await clearOnboardingAnswers();
      await refreshProfile();
      router.replace('/(creator)/(tabs)');
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error && e.message ? `Could not finish. ${e.message}` : 'Could not finish. Try again.', {
        label: 'Retry',
        onPress: () => void finish(),
      });
    }
  };

  const work = state.kind === 'ready' ? state.work : null;
  const copy = copyFor(work, niche.companyName);
  const waiting = !!work && work.tasks > 0;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top, paddingHorizontal: space.screen, paddingBottom: Math.max(insets.bottom, space[6]) }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] }}>
        <Animated.View
          entering={ZoomIn.duration(motion.sheet).easing(motion.spring)}
          style={{ width: 88, height: 88, borderRadius: radius.pill, backgroundColor: waiting ? color.amberTint : color.blueTint, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={waiting ? 'videocam' : 'rocket_launch'} size={40} color={waiting ? color.amber : color.blue} />
        </Animated.View>
        {state.kind === 'loading' ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: space[3] }}>
            <Text style={[text.title, { textAlign: 'center' }]}>{"You're in"}</Text>
            <ActivityIndicator color={color.grey4} />
          </Animated.View>
        ) : (
          <Animated.View key={state.kind} entering={FadeInDown.duration(motion.tabIn).easing(motion.tabEase)} style={{ alignItems: 'center', gap: space[3] }}>
            <Text style={[text.title, { textAlign: 'center' }]}>{copy.title}</Text>
            <Text style={[text.body, { fontSize: 16, lineHeight: 23, color: color.grey4, textAlign: 'center', maxWidth: 300 }]}>
              {state.kind === 'failed' ? 'Could not check what is waiting for you. Home shows it once you are in.' : copy.body}
            </Text>
            {state.kind === 'failed' ? <QuietButton label="Try again" onPress={() => void read()} /> : null}
          </Animated.View>
        )}
      </View>
      <PrimaryButton label={busy ? 'Opening Noni' : copy.cta} busy={busy} disabled={state.kind === 'loading'} onPress={() => void finish()} />
    </View>
  );
}
