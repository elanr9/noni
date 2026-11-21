import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MS_PER_WORD, Teleprompter } from '../../components/Teleprompter';
import { Icon, Press } from '../../components/v2';
import { useAuth } from '../../lib/auth';
import { useCompanyNiche } from '../../lib/company-copy-api';
import { color, motion, radius, space, text } from '../../theme/v2';
import { CREATOR_STEPS, PrimaryButton, QuietButton } from './_shell';

const TAKE_SECONDS = 15;

/** Record button: white ring, blue disc that squares off while the take runs. */
function RecordButton({ running, onPress }: { running: boolean; onPress: () => void }) {
  const r = useSharedValue(29);
  const s = useSharedValue(58);
  useEffect(() => {
    r.set(withTiming(running ? 8 : 29, { duration: motion.press * 2, easing: motion.ease }));
    s.set(withTiming(running ? 32 : 58, { duration: motion.press * 2, easing: motion.ease }));
  }, [running, r, s]);
  const inner = useAnimatedStyle(() => ({ width: s.get(), height: s.get(), borderRadius: r.get() }));
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={running ? 'Stop practice take' : 'Start practice take'}
      onPress={onPress}
      style={{ width: 76, height: 76, borderRadius: radius.pill, borderWidth: 4, borderColor: color.white, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[{ backgroundColor: color.blue }, inner]} />
    </Press>
  );
}

/** Step 6: a throwaway take so the teleprompter feels familiar before the first real post. Nothing records or uploads. */
export default function PracticeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const niche = useCompanyNiche();
  const [cam] = useCameraPermissions();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [left, setLeft] = useState(TAKE_SECONDS);

  const first = profile?.full_name?.trim().split(/\s+/)[0];
  const script = useMemo(() => {
    const me = first ? `Hi, I'm ${first}.` : 'Hi there.';
    const team = niche.companyName ? ` before my first real post for ${niche.companyName}` : ' before my first real post';
    return `${me} This is a quick throwaway clip so I can feel the teleprompter${team}. The words light up as I go, so I just read along and keep looking at the lens.`;
  }, [first, niche.companyName]);
  const words = script.split(/\s+/).length;

  // Counts down while running; the take ends at zero or when the script runs out.
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const limit = Math.min(TAKE_SECONDS * 1000, words * MS_PER_WORD + 600);
    const timer = setInterval(() => {
      const ms = Date.now() - started;
      setLeft(Math.max(0, Math.ceil((TAKE_SECONDS * 1000 - ms) / 1000)));
      if (ms >= limit) {
        setRunning(false);
        setDone(true);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [running, words]);

  const toggle = () => {
    if (running) {
      setRunning(false);
      setDone(true);
      return;
    }
    setResetKey((k) => k + 1);
    setLeft(TAKE_SECONDS);
    setDone(false);
    setRunning(true);
  };

  const next = () => {
    setRunning(false);
    router.push('/(onboarding)/done');
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: space.screen, gap: space[2] }}>
        <Press accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron_left" size={32} color={color.ink} />
        </Press>
        <Text style={[text.row, { flex: 1 }]}>Practice take</Text>
        <Text style={text.meta}>{`${CREATOR_STEPS} of ${CREATOR_STEPS}`}</Text>
      </View>

      <Animated.View
        entering={FadeInDown.duration(motion.tabIn).easing(motion.tabEase)}
        style={{ flex: 1, marginHorizontal: space.screen, marginBottom: space[4], borderRadius: radius.sheetLg, overflow: 'hidden', backgroundColor: color.ink }}
      >
        {cam?.granted ? <CameraView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="front" mirror /> : null}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim }} />
        <View style={{ paddingTop: space[4] }}>
          <Teleprompter text={script} running={running} paused={false} speed={1} resetKey={resetKey} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center', gap: space[3], paddingBottom: space[6] }}>
          {running ? (
            <Animated.View entering={FadeIn.duration(160)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.scrim }}>
              <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.pink }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: color.white, fontVariant: ['tabular-nums'] }}>{`0:${String(left).padStart(2, '0')}`}</Text>
            </Animated.View>
          ) : (
            <Animated.Text entering={FadeIn.duration(200)} style={{ fontSize: 14, fontWeight: '600', color: color.white, textAlign: 'center', paddingHorizontal: space[6] }}>
              {done ? 'Nice. Real takes work the same way.' : 'Tap to start. Practice only, nothing is saved.'}
            </Animated.Text>
          )}
          <RecordButton running={running} onPress={toggle} />
        </View>
      </Animated.View>

      <View style={{ paddingHorizontal: space.screen, paddingBottom: Math.max(insets.bottom, space[6]), gap: space[1] }}>
        {done ? (
          <>
            <PrimaryButton label="That's the idea" onPress={next} />
            <QuietButton label="Try again" onPress={toggle} />
          </>
        ) : (
          <QuietButton label="Skip practice" onPress={next} />
        )}
      </View>
    </View>
  );
}
