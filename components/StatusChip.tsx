import { StyleSheet, Text, View } from 'react-native';

import { statusColor, statusLabel, type TaskStatus } from '../lib/tasks';

export function StatusChip({ status }: { status: TaskStatus }) {
  const bg = statusColor(status);
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={styles.text}>{statusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
