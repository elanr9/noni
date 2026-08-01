import { StyleSheet, Text, View } from 'react-native';

import { color, shadow } from '../../theme/tokens';
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
  /** Day of month if today falls in this month, else null. */
  todayDay: number | null;
  onSelectDay: (day: number) => void;
}

export function MonthGrid({
  year,
  month,
  postCounts,
  selectedDay,
  todayDay,
  onSelectDay,
}: MonthGridProps) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <View style={styles.header}>
        <Text style={styles.month}>{`${MONTHS[month]} ${year}`}</Text>
        <Text style={styles.hint}>Tap a day</Text>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((letter, i) => (
          <View key={`w${i}`} style={styles.cellSlot}>
            <Text style={styles.weekday}>{letter}</Text>
          </View>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cellSlot} />;
          const count = postCounts[day] ?? 0;
          const isSelected = day === selectedDay;
          const isToday = day === todayDay;
          return (
            <View key={day} style={styles.cellSlot}>
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelectDay(day)}
                style={[
                  styles.cell,
                  isSelected && styles.cellSelected,
                  !isSelected && isToday && styles.cellToday,
                ]}
              >
                <Text
                  style={[
                    styles.number,
                    count === 0 && styles.numberQuiet,
                    !isSelected && isToday && styles.numberToday,
                    isSelected && styles.numberSelected,
                  ]}
                >
                  {day}
                </Text>
                {count > 0 && (
                  <View style={styles.dots}>
                    {Array.from({ length: Math.min(count, 3) }, (_, d) => (
                      <View
                        key={d}
                        style={[styles.dot, isSelected && styles.dotSelected]}
                      />
                    ))}
                  </View>
                )}
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
  card: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 18,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  month: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  cellSlot: {
    width: CELL_WIDTH,
    padding: 1,
  },
  weekday: {
    fontSize: 11,
    fontWeight: '700',
    color: color.slate400,
    textAlign: 'center',
    paddingBottom: 4,
  },
  cell: {
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellSelected: {
    backgroundColor: color.accent,
  },
  cellToday: {
    backgroundColor: color.blue100,
  },
  number: {
    fontSize: 13,
    fontWeight: '700',
    color: color.ink,
  },
  numberQuiet: {
    color: color.slate300,
  },
  numberToday: {
    color: color.blue700,
  },
  numberSelected: {
    color: color.white,
  },
  dots: {
    flexDirection: 'row',
    gap: 2,
    height: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: color.blue300,
  },
  dotSelected: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
