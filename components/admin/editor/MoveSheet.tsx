// Admin handoff §8 — the Move control's slot list, derived from the type
// (Hook, Clip 1…Clip N, Outro / Slide 1…Slide N). One screenshot per
// slot; picking an occupied slot swaps the two.
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Sheet } from '../shared';

export interface MoveSlot {
  segmentId: string;
  /** "Hook", "Clip 3", "Slide 2", "Outro". */
  label: string;
  occupied: boolean;
}

export interface MoveSheetProps {
  visible: boolean;
  slots: MoveSlot[];
  /** The slot the screenshot sits on now. */
  currentSegmentId: string | null;
  onClose: () => void;
  onPick: (segmentId: string) => void;
}

export function MoveSheet({
  visible,
  slots,
  currentSegmentId,
  onClose,
  onPick,
}: MoveSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Show screenshot on</Text>
      <Text style={styles.subtitle}>
        One screenshot per slot. Picking a taken slot swaps the two.
      </Text>
      <View style={styles.list}>
        {slots.map((slot) => {
          const current = slot.segmentId === currentSegmentId;
          return (
            <PressableScale
              key={slot.segmentId}
              accessibilityRole="button"
              accessibilityLabel={slot.label}
              accessibilityState={{ selected: current }}
              disabled={current}
              onPress={() => onPick(slot.segmentId)}
              style={[styles.row, current && styles.rowCurrent]}
            >
              <Text style={[styles.label, current && styles.labelCurrent]}>
                {slot.label}
              </Text>
              {current ? (
                <Icon name="check" size={15} color={color.blue700} />
              ) : slot.occupied ? (
                <Text style={styles.taken}>Taken · swaps</Text>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
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
  rowCurrent: {
    backgroundColor: color.blue100,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
  },
  labelCurrent: {
    color: color.blue700,
  },
  taken: {
    fontSize: 12,
    fontWeight: '600',
    color: color.amber,
  },
});
