import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EDIT_SPEEDS, type EditSpeed } from '../../../../lib/video-edit';
import { color, type } from '../../../../theme/tokens';
import { PressableScale } from '../../../ui/PressableScale';
import { PickerPanel } from './PickerPanel';

export function SpeedPicker(props: {
  value: EditSpeed;
  onChange: (speed: EditSpeed) => void;
  onClose: () => void;
}): JSX.Element {
  const { value, onChange, onClose } = props;
  return (
    <PickerPanel title="Speed" onClose={onClose}>
      <View style={styles.row}>
        {EDIT_SPEEDS.map((speed) => {
          const on = speed === value;
          return (
            <PressableScale
              key={speed}
              accessibilityRole="button"
              accessibilityLabel={`${speed}x speed`}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(speed)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.text, on && styles.textOn]}>{speed}x</Text>
            </PressableScale>
          );
        })}
      </View>
    </PickerPanel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: color.white },
  text: { color: color.white, fontSize: type.size.bodySm, fontWeight: type.weight.bold },
  textOn: { color: color.ink },
});
