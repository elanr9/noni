import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface SegmentedOption {
  label: string;
  /** Rendered inside the pill so an empty lane never costs a tap. */
  count?: number;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: number;
  onChange: (index: number) => void;
}

/**
 * Admin handoff §2 — switcher with counts inside it. Track quiet fill,
 * active pill white + card shadow, count bubble blue on the active
 * non-zero lane.
 */
export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <View style={styles.track}>
      {options.map((option, index) => {
        const active = index === value;
        return (
          <PressableScale
            key={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(index)}
            style={[styles.item, active && [styles.itemActive, shadow.shadowCard]]}
          >
            <Text style={[styles.label, { color: active ? color.ink : color.slate500 }]}>
              {option.label}
            </Text>
            {option.count !== undefined && option.count > 0 && (
              <Text
                style={[
                  styles.count,
                  active
                    ? { backgroundColor: color.blue500, color: color.white }
                    : { backgroundColor: color.lineStrong, color: color.slate500 },
                ]}
              >
                {option.count}
              </Text>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
  },
  itemActive: {
    backgroundColor: color.white,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  count: {
    minWidth: 19,
    textAlign: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: radiusAdmin.pill,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
});
