// Month grid for picking the day a brief week starts. Today and earlier
// are locked; the chosen day plus the six after it show the week's span.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BRIEF_WEEK_DAYS } from '../../lib/briefs-api';
import { color, radius, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

const WEEKDAY_HEADS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Cells for one month, padded with nulls so the first row starts on Sunday. */
function monthCells(month: Date): (string | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(isoDate(new Date(month.getFullYear(), month.getMonth(), day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function StartDayCalendar(props: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const selected = parseIso(props.value);
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const today = isoDate(new Date());
  const spanEnd = isoDate(addDays(selected, BRIEF_WEEK_DAYS - 1));
  const cells = monthCells(month);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  function shiftMonth(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  const monthLabel = month.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => shiftMonth(-1)}
          style={styles.navBtn}
        >
          <Icon name="chevron-left" size={18} color={color.slate500} />
        </PressableScale>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => shiftMonth(1)}
          style={styles.navBtn}
        >
          <Icon name="chevron-right" size={18} color={color.slate500} />
        </PressableScale>
      </View>

      <View style={styles.row}>
        {WEEKDAY_HEADS.map((head, i) => (
          <Text key={`${head}-${i}`} style={styles.weekdayHead}>
            {head}
          </Text>
        ))}
      </View>

      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((iso, cellIndex) => {
            if (iso === null) {
              return <View key={`empty-${cellIndex}`} style={styles.cell} />;
            }
            const locked = iso <= today;
            const isStart = iso === props.value;
            const inSpan = !isStart && iso > props.value && iso <= spanEnd;
            return (
              <PressableScale
                key={iso}
                accessibilityRole="button"
                accessibilityState={{ selected: isStart, disabled: locked }}
                disabled={locked}
                onPress={() => props.onChange(iso)}
                style={[
                  styles.cell,
                  inSpan && styles.cellInSpan,
                  isStart && styles.cellStart,
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    locked && styles.cellTextLocked,
                    inSpan && styles.cellTextInSpan,
                    isStart && styles.cellTextStart,
                  ]}
                >
                  {parseIso(iso).getDate()}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  monthLabel: {
    fontSize: type.size.body,
    fontWeight: '700',
    color: color.ink,
  },
  row: {
    flexDirection: 'row',
  },
  weekdayHead: {
    flex: 1,
    textAlign: 'center',
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    paddingVertical: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  cellInSpan: {
    backgroundColor: color.blue50,
    borderRadius: 0,
  },
  cellStart: {
    backgroundColor: color.blue500,
  },
  cellText: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  cellTextLocked: {
    color: color.slate300,
  },
  cellTextInSpan: {
    color: color.blue700,
  },
  cellTextStart: {
    color: color.white,
    fontWeight: '700',
  },
});
