import { StyleSheet, Text, View } from 'react-native';

import { color, radius, space, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

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

export interface MonthGridProps {
  year: number;
  /** 0-based month. */
  month: number;
  /** Post count per day of month. */
  postCounts: Readonly<Record<number, number>>;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

export function MonthGrid({
  year,
  month,
  postCounts,
  selectedDay,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: MonthGridProps) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.month}>{MONTHS[month]}</Text>
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
          const count = postCounts[day] ?? 0;
          const isSelected = day === selectedDay;
          const dots = Math.min(count, 2);
          return (
            <View key={day} style={styles.cellSlot}>
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelectDay(day)}
                style={[styles.cell, isSelected && styles.cellSelected]}
              >
                <Text
                  style={[styles.number, isSelected && styles.numberSelected]}
                >
                  {day}
                </Text>
                <View style={styles.dots}>
                  {Array.from({ length: dots }, (_, d) => (
                    <View
                      key={d}
                      style={[styles.dot, isSelected && styles.dotSelected]}
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
  cellSelected: {
    backgroundColor: color.ink,
  },
  number: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.ink,
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
    backgroundColor: color.blue500,
  },
  dotSelected: {
    backgroundColor: color.white,
  },
});
