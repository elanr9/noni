import type { JSX, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';

/** Dark inline panel that replaces the tool row while a picker is open. */
export function PickerPanel(props: { title: string; onClose: () => void; children: ReactNode }): JSX.Element {
  const { title, onClose, children } = props;
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={10}
          style={styles.close}
        >
          <Icon name="x" size={18} color={color.white} />
        </PressableScale>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  title: { color: color.white, fontSize: type.size.bodySm, fontWeight: type.weight.bold },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  body: { paddingTop: 8 },
});
