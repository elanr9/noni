// The week calendar card shared by Analytics > Posts and the creator profile
// (ANALYTICS.md section 2): S to S letters, a swipeable strip of three weeks
// with the current one in the middle, subtle chevrons at the edges, a dot
// under days with posts (green when one passed 20k views). Today is a solid
// blue circle, the selected day grey-1 with an ink ring, future days grey-3.
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { addDays, DAY_LETTERS, sameDay, sunday, today } from '../../../../lib/v2-format';
import { color, radius, shadow } from '../../../../theme/v2';
import { Icon, Press, TabPane, tap } from '../../../v2';

/** Page settle: close to critically damped, never past the target, carries the finger's speed. */
const PAGE_SPRING = { stiffness: 320, damping: 34, mass: 1, overshootClamping: true } as const;
/** Drag past the first or last page moves at a quarter speed. */
const RESIST = 0.25;
/** How far ahead a flick is projected when choosing the page to land on, in seconds. */
const FLICK = 0.18;
/** Day cell heights: the circle, the gap, the dot box and 2 above and below. */
const ROW = 49;
const ROW_COMPACT = 45;
export const HOT_VIEWS = 20000;

export type DayMark = { count: number; hot: boolean };

export interface WeekCardProps {
  /** Weeks from the current week: 0 is this week, -1 last week. */
  week: number;
  onWeek: (week: number) => void;
  /** Earliest and latest week reachable. */
  minWeek?: number;
  maxWeek?: number;
  selected: Date | null;
  onSelect: (day: Date | null) => void;
  marks: (day: Date) => DayMark;
  /** Replaces the day strip with a month grid that pages by month (the creator profile). */
  months?: MonthPages;
}

export interface MonthPages {
  /** Months from the current month: 0 is this month, -1 last month. */
  month: number;
  onMonth: (month: number) => void;
  minMonth: number;
  maxMonth: number;
  /** Week rows in a month, so the card can grow and shrink with the swipe. */
  rows: (month: number) => number;
  render: (month: number) => ReactNode;
}

/** The seven days of a week offset from the current one, Sunday first. */
export function weekDays(week: number, now = today()): Date[] {
  const start = addDays(sunday(now), week * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function DayCell({ day, selected, mark, onPress, compact = false }: { day: Date; selected: boolean; mark: DayMark; onPress: () => void; compact?: boolean }) {
  const now = today();
  const isToday = sameDay(day, now);
  const future = day > now;
  const size = compact ? 30 : 34;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={day.toDateString()} accessibilityState={{ selected }} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isToday ? color.blue : selected ? color.grey1 : 'transparent',
          boxShadow: selected && !isToday ? `inset 0 0 0 1.5px ${color.ink}` : undefined,
        }}
      >
        <Text style={{ fontSize: compact ? 15 : 17, lineHeight: size, fontWeight: isToday || selected ? '700' : '500', color: isToday ? color.white : future ? color.grey3 : color.ink }}>{day.getDate()}</Text>
      </View>
      <View style={{ height: 7, justifyContent: 'center' }}>
        <View style={{ width: mark.hot ? 7 : 5, height: mark.hot ? 7 : 5, borderRadius: radius.pill, backgroundColor: mark.count ? (mark.hot ? color.green : color.grey3) : 'transparent' }} />
      </View>
    </Press>
  );
}

interface PagerHandle {
  go: (step: number) => void;
}

interface PagerProps {
  index: number;
  onIndex: (index: number) => void;
  min: number;
  max: number;
  render: (index: number) => ReactNode;
  /** Page height. Pages of different heights make the pager follow the swipe between them. */
  heightOf: (index: number) => number;
  ref?: Ref<PagerHandle>;
}

/**
 * Horizontal pager over an unbounded run of pages. Only the page shown and its two neighbours
 * are mounted. The track offset is one shared value in pixels that is never reset, and each page
 * keeps its place when the index changes, so landing on a page never redraws or jumps.
 */
function Pager({ index, onIndex, min, max, render, heightOf, ref }: PagerProps) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const from = useSharedValue(0);
  const grab = useSharedValue(0);

  const [landed, setLanded] = useState(0);

  // Rest on the page the owner names: after layout, after a landing (the owner may refuse the
  // page), and after an index change made outside the pager (a day picked in the month grid).
  useEffect(() => {
    x.set(-index * w);
  }, [index, w, landed, x]);

  const land = (to: number) => {
    if (to === index) return;
    onIndex(to);
    setLanded((n) => n + 1);
  };
  const settle = (to: number, velocity: number) => {
    'worklet';
    x.set(
      withSpring(-to * w, { ...PAGE_SPRING, velocity }, (done) => {
        if (done) runOnJS(land)(to);
      }),
    );
  };

  useImperativeHandle(ref, () => ({
    go: (step: number) => {
      const to = Math.min(max, Math.max(min, index + step));
      if (to === index || !w) return;
      tap();
      settle(to, 0);
    },
  }));

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      // Catch a page mid-flight, and start from where the finger is now so nothing jumps.
      cancelAnimation(x);
      from.set(x.get());
      grab.set(e.translationX);
    })
    .onUpdate((e) => {
      const next = from.get() + e.translationX - grab.get();
      const lo = -max * w;
      const hi = -min * w;
      x.set(next < lo ? lo + (next - lo) * RESIST : next > hi ? hi + (next - hi) * RESIST : next);
    })
    .onEnd((e) => {
      if (!w) return;
      const projected = -(x.get() + e.velocityX * FLICK) / w;
      const to = Math.min(Math.min(max, index + 1), Math.max(Math.max(min, index - 1), Math.round(projected)));
      if (to !== index) runOnJS(tap)();
      settle(to, e.velocityX);
    });

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const hPrev = heightOf(index - 1);
  const hHere = heightOf(index);
  const hNext = heightOf(index + 1);
  const frame = useAnimatedStyle(() => {
    if (!w) return { height: hHere };
    const d = Math.max(-1, Math.min(1, -x.get() / w - index));
    return { height: d < 0 ? hHere + (hPrev - hHere) * -d : hHere + (hNext - hHere) * d };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ overflow: 'hidden' }, frame]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          // The margin moves with the index in the same commit that swaps the pages, so a page never shifts.
          <Animated.View style={[{ flexDirection: 'row', alignItems: 'flex-start', width: w * 3, marginLeft: (index - 1) * w }, track]}>
            {[index - 1, index, index + 1].map((i) => (
              <View key={i} style={{ width: w }}>
                {i >= min && i <= max ? render(i) : null}
              </View>
            ))}
          </Animated.View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

export function WeekCard({ week, onWeek, minWeek = -3, maxWeek = 0, selected, onSelect, marks, months }: WeekCardProps) {
  const pager = useRef<PagerHandle>(null);
  const canBack = months ? months.month > months.minMonth : week > minWeek;
  const canFwd = months ? months.month < months.maxMonth : week < maxWeek;
  const pick = (d: Date) => onSelect(selected && sameDay(selected, d) ? null : d);

  return (
    <View style={styles.card}>
      {[-1, 1].map((step) => {
        const dis = step < 0 ? !canBack : !canFwd;
        return (
          <Press
            key={step}
            accessibilityRole="button"
            accessibilityLabel={months ? (step < 0 ? 'Previous month' : 'Next month') : step < 0 ? 'Previous week' : 'Next week'}
            disabled={dis}
            onPress={() => pager.current?.go(step)}
            haptic={false}
            hitSlop={8}
            style={[styles.chev, step < 0 ? { left: 2 } : { right: 2 }, { opacity: dis ? 0.25 : 1 }]}
          >
            <Icon name={step < 0 ? 'chevron_left' : 'chevron_right'} size={22} color={color.grey3} />
          </Press>
        );
      })}
      <View style={styles.letters}>
        {DAY_LETTERS.map((l, i) => (
          <Text key={i} style={styles.letter}>
            {l}
          </Text>
        ))}
      </View>
      {months ? (
        <TabPane k="months" duration={160} style={{ flex: 0 }}>
          <Pager ref={pager} index={months.month} onIndex={months.onMonth} min={months.minMonth} max={months.maxMonth} heightOf={(m) => months.rows(m) * ROW_COMPACT} render={months.render} />
        </TabPane>
      ) : (
        <Pager
          ref={pager}
          index={week}
          onIndex={(to) => {
            onWeek(to);
            onSelect(null);
          }}
          min={minWeek}
          max={maxWeek}
          heightOf={() => ROW}
          render={(i) => (
            <View style={{ flexDirection: 'row' }}>
              {weekDays(i).map((d) => (
                <DayCell key={d.getTime()} day={d} selected={!!selected && sameDay(selected, d)} mark={marks(d)} onPress={() => pick(d)} />
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 30, overflow: 'hidden', ...shadow.card },
  chev: { position: 'absolute', top: 28, width: 28, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  letters: { flexDirection: 'row', paddingBottom: 4 },
  letter: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600', color: color.grey4 },
});
