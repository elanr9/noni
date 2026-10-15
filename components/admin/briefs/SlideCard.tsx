// One 9:16 slide (SSShared.jsx SlideCard). Solid = the manager wrote it,
// dashed = the creator fills it in. Tiny cards (w <= 70) draw text as bars.

import { GradientFill as LinearGradient, type GradientStops } from '../../shared/briefs/GradientFill';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SlideBox, SlideTextStyle, TextSpan } from '../../../lib/briefs-api';
import type { LibraryFeature } from '../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { fontSizeFor, layoutOf, resolveTextStyle, SLIDE_RATIO } from './canvas/layout';
import { Shot, ShotPlaceholder, type FeatureTone } from './Shot';
import { SlideText } from './SlideText';

export type SlideWho = 'manager' | 'creator' | 'mixed';
export type { GradientStops };

export interface SlideCardProps {
  w?: number;
  text?: string;
  inset?: LibraryFeature | null;
  /** Toned placeholder when the feature row is not loaded (peek examples). */
  insetTone?: FeatureTone;
  box?: SlideBox;
  insetBox?: SlideBox;
  tstyle?: SlideTextStyle;
  /** Per word colors on the text (BriefSlide.spans). */
  spans?: TextSpan[];
  who?: SlideWho;
  label?: string;
  index?: number;
  selected?: boolean;
  onPress?: () => void;
  dim?: boolean;
  accent?: string;
  /** No radius, border or shadow: the card fills a frame. */
  bare?: boolean;
  video?: boolean;
  /** Gradient stops behind a manager slide; defaults to briefTone.managerSlide. */
  background?: GradientStops;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function SlideCard({
  w = 150,
  text,
  inset,
  insetTone,
  box,
  insetBox,
  tstyle,
  spans,
  who = 'manager',
  label,
  index,
  selected = false,
  onPress,
  dim = false,
  accent = color.blue500,
  bare = false,
  video = false,
  background,
  style,
  children,
}: SlideCardProps) {
  const h = Math.round(w * SLIDE_RATIO);
  const creator = who !== 'manager';
  const fs = fontSizeFor(w, tstyle?.size ?? 1);
  const hasInset = Boolean(inset) || Boolean(insetTone);
  const L = layoutOf({ box, inset_box: insetBox, inset_feature_id: hasInset ? 'x' : null, text });
  const ts = resolveTextStyle(tstyle);
  const bars = text ? Math.min(3, Math.ceil(text.length / 18)) : 0;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Slide ${index != null ? index + 1 : ''}`.trim()}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.card,
        {
          width: w,
          height: h,
          borderRadius: bare ? 0 : w * 0.11,
          opacity: dim ? 0.55 : 1,
          backgroundColor: creator ? briefTone.creatorStripe[0] : briefTone.managerSlide[0],
        },
        !bare && creator ? styles.creatorBorder : null,
        !bare && !creator ? styles.managerBorder : null,
        !bare && selected ? { borderWidth: 3, borderColor: accent, borderStyle: 'solid' } : null,
        style,
      ]}
    >
      {creator ? <Stripes w={w} /> : <LinearGradient colors={background ?? briefTone.managerSlide} style={StyleSheet.absoluteFill} />}
      {who === 'creator' ? (
        <View style={styles.creatorBody}>
          <Icon name="camera" size={Math.round(w * 0.17)} color={color.slate300} />
          {w >= 110 && label ? (
            <Text style={[styles.creatorLabel, { fontSize: Math.round(w * 0.075), paddingHorizontal: w * 0.1 }]}>{label}</Text>
          ) : null}
        </View>
      ) : null}
      {hasInset ? (
        <CenteredAt x={L.inset.x * w} y={L.inset.y * h} width={w * L.inset.w}>
          {inset ? <Shot feature={inset} w={w * L.inset.w} video={video} /> : insetTone ? <ShotPlaceholder tone={insetTone} w={w * L.inset.w} video={video} /> : null}
        </CenteredAt>
      ) : null}
      {text ? (
        <CenteredAt x={L.text.x * w} y={L.text.y * h} width={w * L.text.w}>
          {w <= 70 ? (
            <View style={[styles.miniBox, { gap: w * 0.035, borderRadius: w * 0.06, paddingVertical: w * 0.06, paddingHorizontal: w * 0.07 }]}>
              {[1, 0.8, 0.55].slice(0, bars).map((f, i) => (
                <View key={i} style={{ height: Math.max(2, w * 0.045), width: `${f * 100}%`, borderRadius: 99, backgroundColor: color.ink }} />
              ))}
            </View>
          ) : (
            <SlideText text={text} ts={ts} fs={fs} spans={spans} />
          )}
        </CenteredAt>
      ) : null}
      {index != null ? (
        <View
          style={[
            styles.badge,
            {
              top: w * 0.06,
              left: w * 0.06,
              minWidth: w * 0.16,
              height: w * 0.16,
              paddingHorizontal: w * 0.04,
              backgroundColor: creator ? color.white : color.scrimStrong,
              borderWidth: creator ? 1 : 0,
            },
          ]}
        >
          <Text style={[styles.badgeText, { fontSize: Math.round(w * 0.085), color: creator ? color.slate500 : color.white }]}>{index + 1}</Text>
        </View>
      ) : null}
      {children}
    </Pressable>
  );
}

/** Absolutely positioned box whose center sits at (x, y); height is measured. */
export function CenteredAt({
  x,
  y,
  width,
  align = 'center',
  style,
  children,
}: {
  x: number;
  y: number;
  width: number;
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [h, setH] = useState(0);
  return (
    <View
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={[
        styles.abs,
        {
          left: x - width / 2,
          top: y - h / 2,
          width,
          alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          opacity: h ? 1 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Diagonal creator stripes (repeating-linear-gradient 135deg, 6px bands): hard stops on one gradient. */
function Stripes({ w }: { w: number }) {
  const h = w * SLIDE_RATIO;
  const band = Math.max(4, w * 0.04);
  const diagonal = Math.hypot(w, h);
  const count = Math.max(2, Math.ceil(diagonal / band));
  const colors: [string, string, ...string[]] = [briefTone.creatorStripe[0], briefTone.creatorStripe[0]];
  const locations: [number, number, ...number[]] = [0, 1 / count];
  for (let i = 1; i < count; i++) {
    const c = i % 2 ? briefTone.creatorStripe[1] : briefTone.creatorStripe[0];
    colors.push(c, c);
    locations.push(i / count, (i + 1) / count);
  }
  return <LinearGradient pointerEvents="none" colors={colors} locations={locations} start={{ x: 0, y: 0 }} end={{ x: 1, y: w / h }} style={StyleSheet.absoluteFill} />;
}

const styles = StyleSheet.create({
  card: { position: 'relative', overflow: 'hidden' },
  creatorBorder: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.lineStrong },
  managerBorder: { borderWidth: 1, borderColor: color.border },
  abs: { position: 'absolute' },
  miniBox: {
    width: '100%',
    backgroundColor: color.white,
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.18,
  },
  creatorBody: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6 },
  creatorLabel: { fontFamily: typeToken.font.ui, fontWeight: '700', color: color.slate400, textAlign: 'center' },
  badge: { position: 'absolute', borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderColor: color.line },
  badgeText: { fontFamily: typeToken.font.ui, fontWeight: '800' },
});
