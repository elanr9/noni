// The week calendar card shared by Analytics > Posts and the creator profile
// (ANALYTICS.md section 2): S to S letters, a swipeable strip of three weeks
// with the current one in the middle, subtle chevrons at the edges, a dot
// under days with posts (green when one passed 20k views). Today is a solid
// blue circle, the selected day grey-1 with an ink ring, future days grey-3.
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { addDays, DAY_LETTERS, sameDay, sunday, today } from '../../../../lib/v2-format';
import { color, radius, shadow } from '../../../../theme/v2';
import { Icon, Press, tap } from '../../../v2';

const SLIDE_MS = 260;
const SLIDE_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const RESIST = 0.25;
const COMMIT = 0.2;
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
  /** Replaces the day strip (the creator profile's month grid). */
  children?: React.ReactNode;
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
      <View style={{ width: mark.hot ? 7 : 5, height: mark.hot ? 7 : 5, borderRadius: radius.pill, backgroundColor: mark.count ? (mark.hot ? color.green : color.grey3) : 'transparent' }} />
    </Press>
  );
}

export function WeekCard({ week, onWeek, minWeek = -3, maxWeek = 0, selected, onSelect, marks, children }: WeekCardProps) {
  const [w, setW] = useState(0);
  const tx = useSharedValue(0);
  const canBack = week > minWeek;
  const canFwd = week < maxWeek;

  const finish = (step: number) => {
    onWeek(week + step);
    onSelect(null);
    tx.set(0);
  };
  const slide = (step: number) => {
    if ((step < 0 && !canBack) || (step > 0 && !canFwd) || !w) return;
    tap();
    tx.set(withTiming(-step * w, { duration: SLIDE_MS, easing: SLIDE_EASE }, (done) => {
      if (done) runOnJS(finish)(step);
    }));
  };
  const settle = (d: number) => {
    if (d < -w * COMMIT && canFwd) slide(1);
    else if (d > w * COMMIT && canBack) slide(-1);
    else tx.set(withTiming(0, { duration: SLIDE_MS, easing: SLIDE_EASE }));
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const d = e.translationX;
      const past = (d < 0 && !canFwd) || (d > 0 && !canBack);
      tx.set(past ? d * RESIST : d);
    })
    .onEnd((e) => {
      runOnJS(settle)(e.translationX);
    });

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: -w + tx.get() }] }));
  const weeks = [week - 1, week, week + 1].map((k) => weekDays(k));
  const pick = (d: Date) => onSelect(selected && sameDay(selected, d) ? null : d);

  return (
    <View style={styles.card}>
      {[-1, 1].map((step) => {
        const dis = step < 0 ? !canBack : !canFwd;
        return (
          <Press
            key={step}
            accessibilityRole="button"
            accessibilityLabel={step < 0 ? 'Previous week' : 'Next week'}
            disabled={dis}
            onPress={() => slide(step)}
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
      {children ?? (
        <GestureDetector gesture={pan}>
          <View style={{ overflow: 'hidden' }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
            {w > 0 ? (
              <Animated.View style={[{ flexDirection: 'row', width: w * 3 }, track]}>
                {weeks.map((days, k) => (
                  <View key={week + k - 1} style={{ width: w, flexDirection: 'row' }}>
                    {days.map((d) => (
                      <DayCell key={d.getTime()} day={d} selected={!!selected && sameDay(selected, d)} mark={marks(d)} onPress={() => pick(d)} />
                    ))}
                  </View>
                ))}
              </Animated.View>
            ) : (
              <View style={{ height: 50 }} />
            )}
          </View>
        </GestureDetector>
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
