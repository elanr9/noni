// One list, two jobs: picking the format a finished post is ported into, and
// picking the finished post an empty slot is built from.
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';
import { Sheet } from '../shared';

export interface PortOption {
  id: string;
  label: string;
  sub?: string;
}

export interface PortSheetProps {
  visible: boolean;
  title: string;
  subtitle: string;
  options: PortOption[];
  emptyText: string;
  /** The option being worked on; the whole list locks while it runs. */
  busyId: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
}

export function PortSheet({
  visible,
  title,
  subtitle,
  options,
  emptyText,
  busyId,
  onClose,
  onPick,
}: PortSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {options.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {options.map((option) => {
            const busy = busyId === option.id;
            return (
              <PressableScale
                key={option.id}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                disabled={busyId !== null}
                onPress={() => onPick(option.id)}
                style={[styles.row, busy && styles.rowBusy]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.label} numberOfLines={2}>
                    {option.label}
                  </Text>
                  {option.sub ? (
                    <Text style={styles.sub}>{option.sub}</Text>
                  ) : null}
                </View>
                {busy ? <ActivityIndicator color={color.blue700} /> : null}
              </PressableScale>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate400,
  },
  empty: {
    fontSize: 14,
    fontWeight: '600',
    color: color.slate500,
    paddingVertical: 8,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.fillQuiet,
  },
  rowBusy: {
    backgroundColor: color.blue100,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate500,
  },
});
