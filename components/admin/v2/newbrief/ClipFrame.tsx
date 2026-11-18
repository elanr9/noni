import { useEffect, useId, type ReactNode } from 'react';
import { Image, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { GsMedia, StOverlay, StText } from '../../../../lib/brief-library';
import { briefs, color, editor, radius } from '../../../../theme/v2';
import { Icon } from '../../../v2';
import { StTextView } from '../../../v2/StTextView';

/** Brand gradient placeholders used by the AI plan for product overlays. */
export const GRADS: Record<string, readonly [string, string]> = {
  'grad:logo': briefs.grads.logo,
  'grad:app': briefs.grads.app,
  'grad:pass': briefs.grads.pass,
  'grad:sprint': briefs.grads.sprint,
  'grad:product': briefs.grads.product,
  'grad:tripod': briefs.grads.tripod,
};
/** Green screen suggested frames are gradients too until real media is picked. */
const GS_PLACEHOLDER: Record<string, readonly [string, string]> = {
  'gs-1': briefs.grads.logo,
  'gs-2': briefs.grads.app,
  'gs-3': briefs.grads.sprint,
};
const FRAME: readonly [string, string] = [editor.panelTop, editor.panel];

export function GradientFill({ colors, deg = 180, style }: { colors: readonly [string, string]; deg?: number; style?: StyleProp<ViewStyle> }) {
  const id = useId();
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a) / 2, dy = -Math.cos(a) / 2;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect width={1} height={1} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** A picked image or video, a gradient placeholder, or the blue green-screen fallback. */
export function MediaFill({ src, style }: { src: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  if (!src) return <GradientFill colors={briefs.grads.logo} deg={160} style={style} />;
  const g = GRADS[src] ?? GS_PLACEHOLDER[src];
  if (g) return <GradientFill colors={g} deg={160} style={style} />;
  return <Image source={{ uri: src }} resizeMode="cover" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, style as StyleProp<ImageStyle>]} />;
}

export interface ClipFrameProps {
  width: number;
  height: number;
  texts: StText[];
  overlays?: StOverlay[];
  /** Green screen media behind the creator, or null for the blue fallback when `green`. */
  green?: boolean;
  gs?: GsMedia | null;
  cta?: boolean;
  /** AI is filling this clip: shimmer over the frame. */
  pending?: boolean;
  /** Change this when the text lands to replay the reveal. */
  revealKey?: string | number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** 9:16 (or any) dark frame with the on-screen text drawn in place. */
export function ClipFrame({ width, height, texts, overlays = [], green, gs, cta, pending, revealKey, radius: r = 0, style, children }: ClipFrameProps) {
  return (
    <View style={[{ width, height, borderRadius: r, overflow: 'hidden', backgroundColor: editor.panel }, style]}>
      {green ? <MediaFill src={gs?.src} /> : <GradientFill colors={FRAME} />}
      {green ? <View style={{ position: 'absolute', left: '15%', right: '15%', bottom: 0, height: width * 0.7 * 1.3, borderTopLeftRadius: 999, borderTopRightRadius: 999, backgroundColor: editor.k35 }} /> : null}
      {green && gs?.kind === 'video' ? (
        <View style={{ position: 'absolute', right: 6, bottom: 6, height: 16, paddingHorizontal: 5, borderRadius: 4, backgroundColor: editor.k60, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Icon name="videocam" size={10} color={color.white} />
          <Text style={{ fontSize: 10, lineHeight: 16, fontWeight: '700', color: color.white }}>{gs.dur}s</Text>
        </View>
      ) : null}
      {overlays.map((o) => {
        const w = (o.w / 100) * width;
        const h = w * 1.25;
        return (
          <View key={o.id} style={{ position: 'absolute', left: (o.x / 100) * width - w / 2, top: (o.y / 100) * height - h / 2, width: w, height: h, overflow: 'hidden' }}>
            <MediaFill src={o.src} />
          </View>
        );
      })}
      <Reveal k={revealKey}>
        {texts.map((x) => (
          <StTextView key={x.id} x={x} width={width} height={height} />
        ))}
      </Reveal>
      {pending ? <Shimmer /> : null}
      {cta ? (
        <View style={{ position: 'absolute', left: 6, top: 6, height: 18, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: color.blue, justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, lineHeight: 18, fontWeight: '700', color: color.white }}>CTA</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

function Reveal({ k, children }: { k?: string | number; children: ReactNode }) {
  return <RevealInner key={k ?? 'static'} animate={k !== undefined}>{children}</RevealInner>;
}

function RevealInner({ animate, children }: { animate: boolean; children: ReactNode }) {
  const t = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) t.set(withTiming(1, { duration: 520, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [animate, t]);
  const s = useAnimatedStyle(() => ({ opacity: t.get(), transform: [{ translateY: 6 * (1 - t.get()) }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, s]}>{children}</Animated.View>;
}

/** Soft sweep while the AI fills a clip. */
export function Shimmer({ light }: { light?: boolean }) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.set(withRepeat(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [o]);
  const s = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: light ? 'transparent' : editor.w08 }, s]}>
      <View style={{ width: '60%', height: 8, borderRadius: radius.pill, backgroundColor: light ? color.blueTint : editor.w18 }} />
      <View style={{ width: '40%', height: 8, borderRadius: radius.pill, backgroundColor: light ? color.blueTint : editor.w18 }} />
    </Animated.View>
  );
}

/** Inline shimmer bar for a text field while the AI writes it. */
export function ShimmerLine({ width = '70%' }: { width?: `${number}%` | number }) {
  const o = useSharedValue(0.45);
  useEffect(() => {
    o.set(withRepeat(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [o]);
  const s = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width, height: 12, borderRadius: radius.pill, backgroundColor: color.blueTint, marginVertical: 5 }, s]} />;
}
