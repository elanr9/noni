// The trend chart (V2Analytics.jsx Bars): one blue line over an area fade,
// white ringed points, the selected point a blue disc with a halo, future
// points not drawn. Whole columns are tappable; the label row's pill slides to
// the selected column. Selection is controlled by the screen: tapping the
// selected point clears it, and with nothing selected the latest non-future
// point reads out in the header.
import { useEffect, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { fmt } from '../../../../lib/v2-format';
import { color, motion, radius, text } from '../../../../theme/v2';
import { tap } from '../../../v2';
import type { ChartPoint } from './periods';

const W = 100;
const H = 48;
const CHART_H = 72;
const DOT = 7;
const SEL = 12;

export interface TrendChartProps {
  points: ChartPoint[];
  title: string;
  /** Selected point index, or null for the default readout. */
  sel: number | null;
  onSel: (i: number | null) => void;
}

/** Index of the latest point that is not in the future (the last one when all are). */
export function defaultPoint(points: ChartPoint[]): number {
  for (let i = points.length - 1; i >= 0; i--) if (!points[i].future) return i;
  return Math.max(0, points.length - 1);
}

export function TrendChart({ points, title, sel: selProp, onSel }: TrendChartProps) {
  const n = Math.max(1, points.length);
  const sel = selProp == null ? defaultPoint(points) : selProp;
  const cur = points[sel] ?? points[0];
  const shown = points.map((p) => (p.future ? null : p.v));
  const max = Math.max(1, ...shown.filter((v): v is number => v != null));
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * W);
  const y = (v: number) => H - 6 - (v / max) * (H - 12);
  const pts = shown.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p != null);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(2)} ${H} L${pts[0][0].toFixed(2)} ${H} Z` : '';

  const [width, setWidth] = useState(0);
  const [labelW, setLabelW] = useState<Record<number, number>>({});
  const colW = width / n;
  const pillW = Math.min(colW, Math.max(28, labelW[sel] ?? 28));
  const pillX = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!width) return;
    const to = colW * sel;
    if (placed.get()) pillX.set(withTiming(to, { duration: motion.pill, easing: motion.tabEase }));
    else {
      pillX.set(to);
      placed.set(true);
    }
  }, [colW, sel, width, pillX, placed]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.get() }], opacity: placed.get() ? 1 : 0 }));

  const pick = (i: number) => {
    tap();
    onSel(i === selProp ? null : i);
  };
  const readout = cur ? (cur.future ? 'upcoming' : fmt(cur.v)) : '';
  const narrow = points.some((p) => p.bottom.length > 4);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6 }}>
        <Text style={text.card}>{title}</Text>
        {cur ? (
          <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: color.grey4 }}>
            {cur.name} {'·'} <Text style={{ color: color.ink, fontWeight: '700' }}>{readout}</Text>
          </Text>
        ) : null}
      </View>
      <View style={{ height: CHART_H }}>
        {width > 0 ? (
          <Svg width={width} height={CHART_H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
            <Defs>
              <LinearGradient id="v2-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color.blue} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color.blue} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {area ? <Path d={area} fill="url(#v2-trend-fill)" /> : null}
            {line ? <Path d={line} fill="none" stroke={color.blue} strokeWidth={1.6} vectorEffect="nonScalingStroke" strokeLinejoin="round" strokeLinecap="round" /> : null}
          </Svg>
        ) : null}
        {width > 0
          ? shown.map((v, i) => {
              if (v == null) return null;
              const on = i === sel;
              const size = on ? SEL : DOT;
              const left = (x(i) / W) * width - size / 2;
              const top = (y(v) / H) * CHART_H - size / 2;
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width: size,
                    height: size,
                    borderRadius: radius.pill,
                    backgroundColor: on ? color.blue : color.white,
                    boxShadow: on ? '0 0 0 3px rgba(27,166,238,0.22)' : `0 0 0 1.6px ${color.blue}`,
                  }}
                />
              );
            })
          : null}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
          {points.map((p, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => pick(i)} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingTop: 8 }}>
        {width > 0 ? (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 8 + 13, left: 0, width: colW, height: 28, alignItems: 'center' }, pillStyle]}>
            <View style={{ width: pillW, height: 28, borderRadius: radius.pill, backgroundColor: color.blue }} />
          </Animated.View>
        ) : null}
        {points.map((p, i) => {
          const on = i === sel;
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => pick(i)} style={{ flex: 1, alignItems: 'center', gap: 1 }}>
              <Text style={{ fontSize: 10, lineHeight: 12, fontWeight: '600', color: on ? color.blueDeep : color.grey3 }}>{p.top}</Text>
              <Text
                numberOfLines={1}
                onLayout={(e) => {
                  const w = Math.ceil(e.nativeEvent.layout.width);
                  setLabelW((m) => (m[i] === w ? m : { ...m, [i]: w }));
                }}
                style={{ minWidth: 28, maxWidth: '100%', paddingHorizontal: 6, height: 28, lineHeight: 28, textAlign: 'center', fontSize: narrow ? 11 : 13, fontWeight: on ? '700' : '500', color: on ? color.white : p.future ? color.grey3 : color.ink }}
              >
                {p.bottom}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
