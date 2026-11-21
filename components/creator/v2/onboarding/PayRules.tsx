// Onboarding "How you get paid": the two base rates, a live preview of what
// one post earns at a chosen view count, the fine print, and bank setup.
// Pure view; the onboarding screen and its dev preview own the data.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  CENTS_PER_1K_VIEWS,
  STATIC_POST_CENTS,
  VIDEO_POST_CENTS,
  VIEW_PAY_CAP_CENTS,
  VIEW_WINDOW_DAYS,
  basePayCents,
  viewPayCents,
  type PostKind,
} from '../../../../lib/creator-pay';
import { money } from '../../../../lib/v2-format';
import { color, motion, radius, shadow, space, text } from '../../../../theme/v2';
import { Icon, Press, type IconName } from '../../../v2';

const VIEW_STEPS = [
  { key: '1k', views: 1_000, label: '1K' },
  { key: '10k', views: 10_000, label: '10K' },
  { key: '50k', views: 50_000, label: '50K' },
  { key: '100k', views: 100_000, label: '100K' },
  { key: '500k', views: 500_000, label: '500K' },
] as const;
type ViewKey = (typeof VIEW_STEPS)[number]['key'];

/** Counts from the last shown value to `cents` with an ease-out, so a change reads as money moving. */
function useCountUp(cents: number, duration = 520): number {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  useEffect(() => {
    const start = Date.now();
    const begin = from.current;
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(begin + (cents - begin) * eased);
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents, duration]);
  return shown;
}

function RateTile({ icon, tint, ink, cents, label, delay }: { icon: IconName; tint: string; ink: string; cents: number; label: string; delay: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(motion.tabIn).easing(motion.tabEase)}
      style={{ flex: 1, backgroundColor: color.card, borderRadius: radius.card, padding: space[4], gap: space[3], ...shadow.card }}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={ink} />
      </View>
      <View>
        <Text style={{ fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1, color: color.ink, fontVariant: ['tabular-nums'] }}>{money(cents)}</Text>
        <Text style={[text.meta, { marginTop: 2 }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

/** Blue hero: pick a post type and a view count, see what that one post pays. */
function EarningsPreview({ delay }: { delay: number }) {
  const [kind, setKind] = useState<PostKind>('video');
  const [viewKey, setViewKey] = useState<ViewKey>('50k');
  const views = VIEW_STEPS.find((s) => s.key === viewKey)?.views ?? 0;
  const base = basePayCents(kind);
  const viewPay = viewPayCents(views);
  const total = useCountUp(base + viewPay);
  const capped = viewPay >= VIEW_PAY_CAP_CENTS;

  const pickViews = (k: ViewKey) => {
    if (k === viewKey) return;
    Haptics.selectionAsync().catch(() => {});
    setViewKey(k);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(motion.tabIn).easing(motion.tabEase)}
      style={{
        borderRadius: radius.card,
        backgroundColor: color.blue,
        backgroundImage: `linear-gradient(140deg, ${color.blue} 0%, ${color.blueDeep} 100%)`,
        padding: space[4],
        gap: space[4],
        ...shadow.blueHero,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon name="trending_up" size={20} color={color.white} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: color.white }}>{`+${money(CENTS_PER_1K_VIEWS)} for every 1,000 views`}</Text>
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)' }}>
        {(['video', 'static'] as const).map((k) => {
          const on = k === kind;
          return (
            <Press
              key={k}
              onPress={() => {
                if (on) return;
                Haptics.selectionAsync().catch(() => {});
                setKind(k);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.white : 'transparent' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: on ? color.blueDeep : color.white }}>{k === 'video' ? 'Video' : 'Static'}</Text>
            </Press>
          );
        })}
      </View>

      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`A ${kind} post with ${views.toLocaleString('en-US')} views pays ${money(base + viewPay)}`}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: color.white, opacity: 0.85 }}>
          {`One ${kind === 'video' ? 'video' : 'static post'} at ${views.toLocaleString('en-US')} views`}
        </Text>
        <Text style={{ fontSize: 52, lineHeight: 58, fontWeight: '800', letterSpacing: -1.5, color: color.white, fontVariant: ['tabular-nums'] }}>{money(total)}</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: color.white, opacity: 0.85 }}>
          {`${money(base)} for posting + ${money(viewPay)} from views${capped ? ' (the max)' : ''}`}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {VIEW_STEPS.map((s) => {
          const on = s.key === viewKey;
          return (
            <Press
              key={s.key}
              onPress={() => pickViews(s.key)}
              accessibilityRole="button"
              accessibilityLabel={`${s.views.toLocaleString('en-US')} views`}
              accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.white : 'rgba(255,255,255,0.18)' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: on ? color.blueDeep : color.white }}>{s.label}</Text>
            </Press>
          );
        })}
      </View>
    </Animated.View>
  );
}

function FinePrint({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={color.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text.body, { fontWeight: '600' }]}>{title}</Text>
        <Text style={[text.meta, { marginTop: 1 }]}>{body}</Text>
      </View>
    </View>
  );
}

/** The rules: rate tiles, live preview, fine print. */
export function PayRules() {
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <RateTile icon="videocam" tint={color.blueTint} ink={color.blueDeep} cents={VIDEO_POST_CENTS} label="for every video" delay={60} />
        <RateTile icon="photo_library" tint={color.purpleTint} ink={color.purple} cents={STATIC_POST_CENTS} label="for every static post" delay={120} />
      </View>
      <EarningsPreview delay={180} />
      <Animated.View
        entering={FadeInDown.delay(240).duration(motion.tabIn).easing(motion.tabEase)}
        style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space[4], gap: space[4], ...shadow.card }}
      >
        <FinePrint icon="bolt" title="Paid when it goes live" body="Your post pay lands in your balance once the post is up." />
        <FinePrint icon="calendar_month" title={`Views count for ${VIEW_WINDOW_DAYS} days`} body={`Up to ${money(VIEW_PAY_CAP_CENTS)} in view pay per post.`} />
        <FinePrint icon="payments" title="Paid every Sunday" body="Your balance goes to your bank at 8 PM Eastern." />
      </Animated.View>
    </>
  );
}

export type PayoutSetupState = 'unknown' | 'none' | 'sent' | 'ready';

/** Bank setup status under the rules: what happens when they tap Set up payouts. */
export function PayoutSetupNote({ state, email }: { state: PayoutSetupState; email?: string | null }) {
  if (state === 'unknown') {
    return (
      <View style={{ height: 72, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={color.grey4} />
      </View>
    );
  }
  const ready = state === 'ready';
  const sent = state === 'sent';
  return (
    <Animated.View
      key={state}
      entering={FadeIn.duration(motion.tabInShort)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[4],
        backgroundColor: color.card,
        borderRadius: radius.option,
        borderWidth: 1.5,
        borderColor: ready ? color.green : sent ? color.blue : 'transparent',
        ...shadow.card,
      }}
    >
      <Animated.View
        entering={ready || sent ? ZoomIn.duration(motion.sheet).easing(motion.spring) : undefined}
        style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? color.greenTint : color.blueTint }}
      >
        <Icon name={ready ? 'check_circle' : sent ? 'mail' : 'paid'} size={22} color={ready ? color.green : color.blueDeep} />
      </Animated.View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={text.row}>{ready ? 'Payouts are set up' : sent ? 'Check your email' : 'Where should we send it?'}</Text>
        <Text style={[text.meta, { marginTop: 2 }]}>
          {ready
            ? 'Your bank is connected. Nothing else to do.'
            : sent
              ? `Mercury, our bank partner, sent a secure link${email ? ` to ${email}` : ''}. Add your bank there, it takes about 3 minutes.`
              : 'Add your bank once through Mercury, our bank partner. Your details never touch Noni.'}
        </Text>
      </View>
    </Animated.View>
  );
}
