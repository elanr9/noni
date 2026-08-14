// Type chips are filter buttons: tap to show that type, tap again to clear.
import { ScrollView, StyleSheet, Text } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import type { GridRowState } from './BriefRow';

export interface SplitChip {
  key: string;
  label: string;
  actual?: number;
  planned?: number;
}

export interface SplitRow {
  key: string;
  state: GridRowState;
}

function isDone(state: GridRowState): boolean {
  return state === 'complete' || state === 'filled' || state === 'killed';
}

export function SplitHeader({
  split,
  rows = [],
  active,
  onSelect,
}: {
  split: SplitChip[];
  rows?: SplitRow[];
  active: string | null;
  onSelect: (key: string | null) => void;
}) {
  if (split.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {split.map((chip) => {
        const typeRows = rows.filter((r) => r.key === chip.key);
        const total = typeRows.length || chip.actual || 0;
        const done = typeRows.filter((r) => isDone(r.state)).length;
        const complete = total > 0 && done >= total;
        const on = active === chip.key;
        return (
          <PressableScale
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${chip.label} ${done} of ${total}`}
            onPress={() => onSelect(on ? null : chip.key)}
            style={[
              styles.chip,
              {
                backgroundColor: on ? color.blue50 : color.white,
                borderColor: on
                  ? color.blue500
                  : complete
                    ? 'rgba(31,168,110,0.45)'
                    : 'rgba(224,138,22,0.5)',
              },
            ]}
          >
            <Text style={styles.label}>{chip.label}</Text>
            <Text
              style={[
                styles.count,
                { color: complete ? color.green : color.amber },
              ]}
            >
              {`${done}/${total}`}
            </Text>
            {complete ? <Icon name="check" size={13} color={color.green} /> : null}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: color.slate500,
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
  },
});
