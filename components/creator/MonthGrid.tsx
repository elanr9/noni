import { StyleSheet, Text, View } from 'react-native';

import { color, radius, shadow, space, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

/**
 * Calendar month card (SCREENS §4): up to 3 status-colored dots per day,
 * selected day accent, today tinted.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

const MAX_DOTS = 3;

export interface MonthGridProps {
  year: number;
  /** 0-based month. */
  month: number;
  /** Status dot colors per day of month (statusDotColor), first 3 render. */
  dotsByDay: Readonly<Record<number, readonly string[]>>;
  /** 0 selects nothing. */
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

export function MonthGrid({
  year,
  month,
  dotsByDay,
  selectedDay,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: MonthGridProps) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const today =
    now.getFullYear() === year && now.getMonth() === month ? now.getDate() : 0;

  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={[styles.root, shadow.shadowCard]}>
      <View style={styles.header}>
        <Text style={styles.month}>{`${MONTHS[month]} ${year}`}</Text>
        <View style={styles.nav}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={onPrevMonth}
            style={styles.navBtn}
          >
            <Icon name="chevron-left" size={20} color={color.slate400} />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={onNextMonth}
            style={styles.navBtn}
          >
            <Icon name="chevron-right" size={20} color={color.ink} />
          </PressableScale>
        </View>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((letter, i) => (
          <View key={`w${i}`} style={styles.cellSlot}>
            <Text style={styles.weekday}>{letter}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cellSlot} />;
          const dots = (dotsByDay[day] ?? []).slice(0, MAX_DOTS);
          const isSelected = day === selectedDay;
          const isToday = day === today;
          return (
            <View key={day} style={styles.cellSlot}>
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelectDay(day)}
                style={[
                  styles.cell,
                  isToday && !isSelected && styles.cellToday,
                  isSelected && styles.cellSelected,
                ]}
              >
                <Text
                  style={[
                    styles.number,
                    isToday && !isSelected && styles.numberToday,
                    isSelected && styles.numberSelected,
                  ]}
                >
                  {day}
                </Text>
                <View style={styles.dots}>
                  {dots.map((dotColor, d) => (
                    <View
                      key={d}
                      style={[
                        styles.dot,
                        { backgroundColor: isSelected ? color.white : dotColor },
                      ]}
                    />
                  ))}
                </View>
              </PressableScale>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CELL_WIDTH = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  root: {
    gap: space[2],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  month: {
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  nav: {
    flexDirection: 'row',
    gap: 14,
  },
  navBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellSlot: {
    width: CELL_WIDTH,
    padding: 1,
  },
  weekday: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.slate400,
    textAlign: 'center',
    paddingBottom: 2,
  },
  cell: {
    height: 44,
    borderRadius: radius.cell,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cellToday: {
    backgroundColor: color.blue100,
  },
  cellSelected: {
    backgroundColor: color.accent,
  },
  number: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
  numberToday: {
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  numberSelected: {
    fontWeight: type.weight.heavy,
    color: color.white,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
});
