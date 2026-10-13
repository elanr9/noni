// After submit: confetti, Sent!, the day streak, what is on approval, what
// is left today, and the next thing. From SSCreator.jsx SentScreen.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type JSX } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import { fetchBountySettings } from '../../../lib/bounty';
import { useCompany } from '../../../lib/company-context';
import { useCreatorQueue } from '../../../lib/creator-queue';
import { fetchMyStreak } from '../../../lib/streaks';
import { briefTone, color, motion, radius, type as typeToken } from '../../../theme/tokens';

const BITS = 26;

type Bit = { k: number; x: number; d: number; r: number; c: string; w: number };

/** Deterministic scatter per bit (a small LCG), so render stays pure. */
function noise(k: number, salt: number): number {
  const v = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function confettiBit(k: number): Bit {
  return {
    k,
    x: noise(k, 1) * 100,
    d: noise(k, 2) * 0.7,
    r: noise(k, 3) * 360,
    c: briefTone.confetti[k % briefTone.confetti.length],
    w: 6 + noise(k, 4) * 6,
  };
}

function ConfettiBit({ bit, height }: { bit: Bit; height: number }): JSX.Element {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: (1.6 + bit.d) * 1000,
      delay: bit.d * 600,
      easing: Easing.bezier(0.2, 0.6, 0.4, 1),
      useNativeDriver: true,
    }).start();
  }, [t, bit.d]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${bit.x}%`,
        top: 0,
        width: bit.w,
        height: bit.w * 0.6,
        borderRadius: 2,
        backgroundColor: bit.c,
        opacity: t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-40, height] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${bit.r}deg`, `${bit.r + 720}deg`] }) },
        ],
      }}
    />
  );
}

function Rise({ delay, children }: { delay: number; children: JSX.Element }): JSX.Element {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: motion.slow, delay, easing: motion.easeOut, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }], alignSelf: 'stretch' }}>
      {children}
    </Animated.View>
  );
}

export default function SentScreen(): JSX.Element {
  const { assignmentId, title } = useLocalSearchParams<{ assignmentId: string; title: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { profile } = useAuth();
  const { active } = useCompany();
  const queue = useCreatorQueue();
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;

  const left = queue.openToday.filter((a) => a.id !== assignmentId).length;
  const [streak, setStreak] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [onApproval, setOnApproval] = useState<string>('$20');

  useEffect(() => {
    if (!companyId || !creatorId) return;
    let cancelled = false;
    fetchMyStreak(companyId, creatorId).then(
      (row) => {
        if (!cancelled) setStreak(row?.current_streak ?? 0);
      },
      () => {
        if (!cancelled) setStreak(0);
      },
    );
    fetchBountySettings(companyId).then(
      (s) => {
        if (cancelled) return;
        const dollars = s.amountCents / 100;
        setOnApproval(Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, creatorId]);

  // Count up to the streak once it is known.
  useEffect(() => {
    if (!streak) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= streak) clearInterval(id);
    }, 55);
    return () => clearInterval(id);
  }, [streak]);

  const [bits] = useState<Bit[]>(() => Array.from({ length: BITS }, (_, k) => confettiBit(k)));

  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [pop]);

  const company = active?.name ?? 'your team';
  const home = () => router.dismissTo('/(creator)/(tabs)');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {bits.map((b) => (
        <ConfettiBit key={b.k} bit={b} height={height} />
      ))}
      <View style={styles.center}>
        <Animated.View style={[styles.check, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }], opacity: pop }]}>
          <Icon name="check" size={56} color={color.white} />
        </Animated.View>
        <Rise delay={320}>
          <View style={styles.copy}>
            <Text style={styles.sent}>Sent!</Text>
            <Text style={styles.sub}>
              {title || 'Your post'} is with {company}. You&apos;ll hear back today.
            </Text>
          </View>
        </Rise>
        <Rise delay={460}>
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <Text style={styles.tileNum}>{count}</Text>
              <Text style={styles.tileLabel}>day streak</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileNum}>{onApproval}</Text>
              <Text style={styles.tileLabel}>on approval</Text>
            </View>
            <View style={styles.tile}>
              <Text style={[styles.tileNum, { color: left ? color.ink : color.green }]}>{left}</Text>
              <Text style={styles.tileLabel}>left today</Text>
            </View>
          </View>
        </Rise>
      </View>
      <Rise delay={600}>
        <View style={[styles.footer, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
          <Button size="lg" block icon={left ? 'arrow-right' : 'house'} onPress={home} style={styles.btn}>
            {left ? 'Next post' : 'Back home'}
          </Button>
        </View>
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.offWhite, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: 28 },
  check: {
    width: 112,
    height: 112,
    borderRadius: 999,
    backgroundColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.green,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 20,
    shadowOpacity: 0.35,
    elevation: 8,
  },
  copy: { alignItems: 'center', gap: 8 },
  sent: { fontFamily: typeToken.font.display, fontSize: 30, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8, color: color.ink },
  sub: { fontFamily: typeToken.font.ui, fontSize: 16, lineHeight: 22, fontWeight: '500', color: color.slate500, textAlign: 'center', maxWidth: 300 },
  tiles: { flexDirection: 'row', gap: 10, width: '100%' },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
  },
  tileNum: { fontFamily: typeToken.font.display, fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6, color: color.ink },
  tileLabel: { fontFamily: typeToken.font.ui, fontSize: 12.5, fontWeight: '600', color: color.slate500 },
  footer: { paddingHorizontal: 24 },
  btn: { height: 56 },
});
