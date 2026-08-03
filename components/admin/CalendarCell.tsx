import { StyleSheet, Text, View } from 'react-native';

import type { ContentFormat } from '../../lib/admin-review-types';
import type { TaskStatus } from '../../lib/tasks';
import { borderWidth, color, radius, shadow, type } from '../../theme/tokens';
import { FormatPill } from '../ui/FormatPill';
import { PressableScale } from '../ui/PressableScale';

export const CELL_WIDTH = 108;
export const CELL_MIN_HEIGHT = 96;

const STATUS_STYLE: Record<
  TaskStatus,
  { label: string; bg: string; fg: string }
> = {
  assigned: { label: 'To do', bg: color.blue100, fg: color.blue700 },
  recorded: { label: 'Recorded', bg: color.fillQuiet, fg: color.slate500 },
  submitted: { label: 'In review', bg: color.amberSoft, fg: color.amber },
  changes_requested: { label: 'Changes', bg: color.amberSoft, fg: color.amber },
  approved: { label: 'Approved', bg: color.greenSoft, fg: color.green },
  posted: { label: 'Posted', bg: color.green, fg: color.white },
};

export type CalendarCellItem = {
  id: string;
  title: string;
  format: ContentFormat;
  status: TaskStatus;
  onPress?: () => void;
};

export function CalendarCell(props: { items: CalendarCellItem[] }) {
  const { items } = props;

  if (items.length === 0) {
    return <View style={styles.empty} />;
  }

  return (
    <View style={styles.stack}>
      {items.map((item) => {
        const status = STATUS_STYLE[item.status];
        return (
          <PressableScale
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            disabled={item.onPress === undefined}
            onPress={item.onPress}
            style={[styles.filled, shadow.shadowCard]}
          >
            <FormatPill format={item.format} compact />
            <Text numberOfLines={2} style={styles.title}>
              {item.title}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusText, { color: status.fg }]}>
                {status.label}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: CELL_WIDTH,
    gap: 6,
  },
  filled: {
    width: CELL_WIDTH,
    padding: 9,
    borderRadius: radius.cell,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 5,
  },
  empty: {
    width: CELL_WIDTH,
    minHeight: CELL_MIN_HEIGHT,
    borderRadius: radius.cell,
    borderWidth: borderWidth.field,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: type.size.label,
    lineHeight: type.size.label * 1.3,
    fontWeight: '700',
    color: color.ink,
    flexGrow: 1,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: type.size.micro,
    fontWeight: '700',
  },
});
