import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BlockLayout } from '../../../../lib/edit-document';
import { color, type } from '../../../../theme/tokens';
import { PressableScale } from '../../../ui/PressableScale';
import { PickerPanel } from './PickerPanel';

const OPTIONS: { layout: BlockLayout; label: string }[] = [
  { layout: 'single', label: 'Single' },
  { layout: 'split_v', label: 'Top and bottom' },
  { layout: 'split_h', label: 'Left and right' },
];

export function LayoutPicker(props: {
  value: BlockLayout;
  onChange: (layout: BlockLayout) => void;
  onClose: () => void;
}): JSX.Element {
  const { value, onChange, onClose } = props;
  return (
    <PickerPanel title="Layout" onClose={onClose}>
      <View style={styles.row}>
        {OPTIONS.map((option) => {
          const on = option.layout === value;
          return (
            <PressableScale
              key={option.layout}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(option.layout)}
              style={[styles.tile, on && styles.tileOn]}
            >
              <LayoutGlyph layout={option.layout} on={on} />
              <Text style={[styles.label, on && styles.labelOn]}>{option.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </PickerPanel>
  );
}

function LayoutGlyph(props: { layout: BlockLayout; on: boolean }): JSX.Element {
  const fill = props.on ? color.ink : color.white;
  const cell = { backgroundColor: fill, borderRadius: 2 };
  if (props.layout === 'single') return <View style={[styles.glyph, cell]} />;
  const vertical = props.layout === 'split_v';
  return (
    <View style={[styles.glyph, { flexDirection: vertical ? 'column' : 'row', gap: 2 }]}>
      <View style={[{ flex: 1 }, cell]} />
      <View style={[{ flex: 1 }, cell]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileOn: { backgroundColor: color.white },
  glyph: { width: 18, height: 30 },
  label: { color: color.white, fontSize: type.size.micro11, fontWeight: type.weight.semibold },
  labelOn: { color: color.ink },
});
