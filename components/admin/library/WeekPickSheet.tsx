import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { FORMAT_LABEL, slotLabel } from '../../../lib/brief-copy';
import type { TargetSlot } from '../../../lib/library-make';
import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Sheet } from '../shared';

export interface WeekPickSheetProps {
  visible: boolean;
  /** One per open week that has an empty slot of the post's format. */
  targets: TargetSlot[];
  /** briefId of the slot being filled right now. */
  busyId: string | null;
  onPick: (target: TargetSlot) => void;
  onClose: () => void;
}

/** Add to week, when more than one open week has room: pick the week. */
export function WeekPickSheet({ visible, targets, busyId, onPick, onClose }: WeekPickSheetProps) {
  const busy = busyId !== null;
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Add to which week?"
      subtitle="It goes into the first empty slot of that week."
    >
      <View style={styles.card}>
        {targets.map((t, i) => {
          const isBusy = busyId === t.slot.briefId;
          return (
            <PressableScale
              key={t.slot.briefId}
              accessibilityRole="button"
              accessibilityLabel={t.weekLabel}
              disabled={busy}
              onPress={() => onPick(t)}
              style={[styles.row, i < targets.length - 1 && styles.rowDivider, isBusy && styles.rowBusy, busy && !isBusy && styles.rowDim]}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{t.weekLabel}</Text>
                <Text style={styles.rowSub}>{`${FORMAT_LABEL[t.slot.format]} ${slotLabel(t.slot.index)} is empty`}</Text>
              </View>
              {isBusy ? <ActivityIndicator size="small" color={color.blue600} /> : <Icon name="chevron-right" size={16} color={color.slate300} />}
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  rowBusy: {
    backgroundColor: color.blue50,
  },
  rowDim: {
    opacity: 0.45,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  rowSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
  },
});
