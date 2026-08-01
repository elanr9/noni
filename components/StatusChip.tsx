import { StyleSheet, Text, View } from 'react-native';

import type { TaskStatus } from '../lib/tasks';
import { color } from '../theme/tokens';

const STATUS: Record<TaskStatus, { label: string; fg: string; bg: string }> = {
  assigned: { label: 'To do', fg: color.blue700, bg: color.blue100 },
  recorded: { label: 'Recorded', fg: color.slate500, bg: color.fillQuiet },
  submitted: { label: 'In review', fg: color.amber, bg: color.amberSoft },
  changes_requested: { label: 'Changes needed', fg: color.amber, bg: color.amberSoft },
  approved: { label: 'Approved', fg: color.green, bg: color.greenSoft },
  posted: { label: 'Posted', fg: color.white, bg: color.green },
};

export function StatusChip({ status, label }: { status: TaskStatus; label?: string }) {
  const s = STATUS[status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <View
        style={[
          styles.dot,
          { backgroundColor: s.fg, opacity: status === 'posted' ? 1 : 0.75 },
        ]}
      />
      <Text numberOfLines={1} style={[styles.text, { color: s.fg }]}>
        {label ?? s.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 13,
  },
});
