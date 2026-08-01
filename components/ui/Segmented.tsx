import { StyleSheet, Text, View } from 'react-native';

import { color, shadow } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

export interface SegmentedProps {
  options: string[];
  value: number;
  onChange: (index: number) => void;
}

export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <View style={styles.track}>
      {options.map((option, index) => {
        const active = index === value;
        return (
          <PressableScale
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(index)}
            style={[styles.item, active && [styles.itemActive, shadow.shadowCard]]}
          >
            <Text style={[styles.label, { color: active ? color.ink : color.slate500 }]}>
              {option}
            </Text>
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
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  itemActive: {
    backgroundColor: color.white,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
