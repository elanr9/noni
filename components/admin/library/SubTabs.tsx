import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface SubTabsProps<T extends string> {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}

/** Two equal segments with count pills. The two lists never mix. */
export function SubTabs<T extends string>({ items, value, onChange }: SubTabsProps<T>) {
  return (
    <View style={styles.track}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <PressableScale
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.id)}
            style={[styles.segment, active && styles.segmentActive, active && shadow.shadowCard]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.count !== undefined && (
              <View style={[styles.pill, active && styles.pillActive]}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{item.count}</Text>
              </View>
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
    gap: 3,
    padding: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  segment: {
    flex: 1,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
  },
  segmentActive: {
    backgroundColor: color.white,
  },
  label: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  labelActive: {
    color: color.ink,
  },
  pill: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
  },
  pillActive: {
    backgroundColor: color.blue100,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: color.slate500,
  },
  pillTextActive: {
    color: color.blue700,
  },
});
