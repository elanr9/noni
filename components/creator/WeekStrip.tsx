import { StyleSheet, Text, View } from 'react-native';

import { statusDotColor } from '../../lib/creator-queue';
import type { TaskStatus } from '../../lib/tasks';
import { color, radius, type } from '../../theme/tokens';
import { PressableScale } from '../ui/PressableScale';

/**
 * Home week strip (SCREENS §1): 7 flex1 cells, radius 16, white bg, selected
 * cell accent with white text. Up to 3 status-colored dots under each date;
 * fully done past days read all green via statusDotColor.
 */

export interface WeekStripDay {
  /** YYYY-MM-DD */
  date: string;
  statuses: TaskStatus[];
}

export interface WeekStripProps {
  days: WeekStripDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function dayParts(date: string): { letter: string; number: number } {
  const d = new Date(`${date}T12:00:00`);
  return { letter: DAY_LETTERS[d.getDay()], number: d.getDate() };
}

export function WeekStrip({ days, selectedDate, onSelectDate }: WeekStripProps) {
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const selected = day.date === selectedDate;
        const { letter, number } = dayParts(day.date);
        const dots = day.statuses.slice(0, 3).map(statusDotColor);
        return (
          <PressableScale
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`Select ${day.date}`}
            accessibilityState={{ selected }}
            onPress={() => onSelectDate(day.date)}
            style={[styles.cell, selected && styles.cellSelected]}
          >
            <Text style={[styles.letter, selected && styles.letterSelected]}>{letter}</Text>
            <Text style={[styles.number, selected && styles.numberSelected]}>{number}</Text>
            <View style={styles.dots}>
              {dots.map((dot, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: dot }]} />
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
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  cellSelected: {
    backgroundColor: color.accent,
    borderColor: color.accent,
  },
  letter: {
    fontSize: type.size.micro,
    fontWeight: type.weight.bold,
    color: color.slate400,
  },
  letterSelected: {
    color: color.whiteA75,
  },
  number: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  numberSelected: {
    color: color.white,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
});
