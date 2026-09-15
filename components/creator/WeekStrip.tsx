import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { OVERDUE_DOT, dayKey, statusDotColor } from '../../lib/creator-queue';
import type { TaskStatus } from '../../lib/tasks';
import { color, radius, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

/**
 * Home week strip (SCREENS §1): 7 flex1 cells, radius 16, white bg, selected
 * cell accent with white text. Up to 3 status-colored dots under each date;
 * overdue open posts read orange. Weeks page horizontally, carets step one week.
 */

export interface WeekStripStatus {
  status: TaskStatus;
  overdue: boolean;
}

export interface WeekStripDay {
  /** YYYY-MM-DD */
  date: string;
  statuses: WeekStripStatus[];
}

export interface WeekStripProps {
  /** Monday YYYY-MM-DD of the visible week. */
  weekStart: string;
  daysForWeek: (weekStart: string) => WeekStripDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onWeekChange?: (weekStart: string) => void;
  /** Renders a small expand button that opens the full month view. */
  onExpand?: () => void;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const WEEKS_BACK = 9;
const WEEKS_FORWARD = 2;

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing date. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function dayParts(date: string): { letter: string; number: number } {
  const d = new Date(`${date}T12:00:00Z`);
  return { letter: DAY_LETTERS[d.getUTCDay()], number: d.getUTCDate() };
}

function WeekPage({
  days,
  width,
  selectedDate,
  todayKey,
  onSelectDate,
}: {
  days: WeekStripDay[];
  width: number;
  selectedDate: string;
  todayKey: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <View style={[styles.row, { width }]}>
      {days.map((day) => {
        const selected = day.date === selectedDate;
        const today = day.date === todayKey && !selected;
        const { letter, number } = dayParts(day.date);
        const dots = day.statuses
          .slice(0, 3)
          .map((s) => (s.overdue ? OVERDUE_DOT : statusDotColor(s.status)));
        return (
          <PressableScale
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`Select ${day.date}`}
            accessibilityState={{ selected }}
            onPress={() => onSelectDate(day.date)}
            style={[styles.cell, today && styles.cellToday, selected && styles.cellSelected]}
          >
            <Text
              style={[
                styles.letter,
                today && styles.letterToday,
                selected && styles.letterSelected,
              ]}
            >
              {today ? 'Today' : letter}
            </Text>
            <Text
              style={[
                styles.number,
                today && styles.numberToday,
                selected && styles.numberSelected,
              ]}
            >
              {number}
            </Text>
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

export function WeekStrip({
  weekStart,
  daysForWeek,
  selectedDate,
  onSelectDate,
  onWeekChange,
  onExpand,
}: WeekStripProps) {
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlatList<string>>(null);
  const todayKey = dayKey(new Date());

  const weeks = useMemo(() => {
    const current = weekStartOf(todayKey);
    return Array.from({ length: WEEKS_BACK + WEEKS_FORWARD + 1 }, (_, i) =>
      addDays(current, (i - WEEKS_BACK) * 7),
    );
  }, [todayKey]);

  const currentIndex = Math.max(0, weeks.indexOf(weekStartOf(todayKey)));
  const foundIndex = weeks.indexOf(weekStart);
  const visibleIndex = foundIndex >= 0 ? foundIndex : currentIndex;
  const scrolledIndex = useRef(visibleIndex);

  useEffect(() => {
    if (width === 0 || scrolledIndex.current === visibleIndex) return;
    scrolledIndex.current = visibleIndex;
    listRef.current?.scrollToIndex({ index: visibleIndex, animated: true });
  }, [visibleIndex, width]);

  const goTo = (index: number) => {
    const target = Math.min(Math.max(index, 0), weeks.length - 1);
    if (target === visibleIndex) return;
    scrolledIndex.current = target;
    listRef.current?.scrollToIndex({ index: target, animated: true });
    onWeekChange?.(weeks[target]);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    const clamped = Math.min(Math.max(index, 0), weeks.length - 1);
    scrolledIndex.current = clamped;
    if (clamped !== visibleIndex) onWeekChange?.(weeks[clamped]);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  const getItemLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
  );

  const renderItem = ({ item }: ListRenderItemInfo<string>) => (
    <WeekPage
      days={daysForWeek(item)}
      width={width}
      selectedDate={selectedDate}
      todayKey={todayKey}
      onSelectDate={onSelectDate}
    />
  );

  const atStart = visibleIndex === 0;
  const atEnd = visibleIndex === weeks.length - 1;

  return (
    <View style={styles.wrap}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Previous week"
        disabled={atStart}
        hitSlop={8}
        onPress={() => goTo(visibleIndex - 1)}
        style={[styles.caret, atStart && styles.caretDisabled]}
      >
        <Icon name="chevron-left" size={14} color={color.slate400} />
      </PressableScale>
      <View style={styles.pages} onLayout={onLayout}>
        {width > 0 ? (
          <FlatList
            ref={listRef}
            data={weeks}
            keyExtractor={(w) => w}
            renderItem={renderItem}
            extraData={{ daysForWeek, selectedDate }}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            getItemLayout={getItemLayout}
            initialScrollIndex={visibleIndex}
            initialNumToRender={3}
            windowSize={3}
            onMomentumScrollEnd={onMomentumEnd}
          />
        ) : null}
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Next week"
        disabled={atEnd}
        hitSlop={8}
        onPress={() => goTo(visibleIndex + 1)}
        style={[styles.caret, atEnd && styles.caretDisabled]}
      >
        <Icon name="chevron-right" size={14} color={color.slate400} />
      </PressableScale>
      {onExpand ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Show full month"
          hitSlop={8}
          onPress={onExpand}
          style={styles.expand}
        >
          <Icon name="calendar-days" size={16} color={color.slate500} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pages: {
    flex: 1,
    minWidth: 0,
  },
  caret: {
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caretDisabled: {
    opacity: 0.3,
  },
  expand: {
    marginLeft: 6,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  cellToday: {
    borderColor: color.accent,
    borderWidth: 1.5,
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
  letterToday: {
    color: color.accent,
  },
  numberToday: {
    color: color.accent,
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
