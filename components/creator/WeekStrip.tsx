import { StyleSheet, Text, View } from 'react-native';

import { color } from '../../theme/tokens';
import { PressableScale } from '../ui/PressableScale';

export interface WeekDay {
  /** YYYY-MM-DD key for the day. */
  key: string;
  /** Single-letter weekday label (M T W T F S S). */
  dow: string;
  dayNumber: number;
  postCount: number;
  /** Every post that day is posted or approved. */
  done: boolean;
  isToday: boolean;
}

export interface WeekStripProps {
  days: WeekDay[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

const MAX_DOTS = 3;

export function WeekStrip({ days, selectedKey, onSelect }: WeekStripProps) {
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const selected = day.key === selectedKey;
        const dotColor = selected
          ? 'rgba(255,255,255,0.85)'
          : day.postCount === 0
            ? color.lineStrong
            : day.done
              ? color.green
              : color.blue300;
        const dotCount = day.postCount === 0 ? 1 : Math.min(day.postCount, MAX_DOTS);

        return (
          <PressableScale
            key={day.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(day.key)}
            style={[styles.day, selected ? styles.daySelected : styles.dayUnselected]}
          >
            <Text
              style={[
                styles.dow,
                { color: selected ? 'rgba(255,255,255,0.8)' : color.slate400 },
              ]}
            >
              {day.dow}
            </Text>
            <Text
              style={[
                styles.date,
                {
                  color: selected
                    ? color.white
                    : day.isToday
                      ? color.blue600
                      : color.ink,
                },
              ]}
            >
              {day.dayNumber}
            </Text>
            <View style={styles.dots}>
              {Array.from({ length: dotCount }, (_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: dotColor }]} />
              ))}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    paddingBottom: 9,
    borderRadius: 16,
    borderWidth: 1,
  },
  daySelected: {
    backgroundColor: color.accent,
    borderColor: 'transparent',
  },
  dayUnselected: {
    backgroundColor: color.white,
    borderColor: color.line,
  },
  dow: {
    fontSize: 11,
    fontWeight: '600',
  },
  date: {
    fontSize: 16,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
    alignItems: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
});
