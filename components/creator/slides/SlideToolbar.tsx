// Actions for the slide under the creator's thumb: add a text box, swap the photo.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export function SlideToolbar(props: {
  onAddText: () => void;
  onPickPhoto: () => void;
  disabled?: boolean;
}): JSX.Element {
  const { onAddText, onPickPhoto, disabled = false } = props;
  return (
    <View style={styles.root}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Replace photo"
        onPress={onPickPhoto}
        disabled={disabled}
        style={styles.btn}
      >
        <Icon name="image" size={15} color={color.white} />
        <Text style={styles.text}>Photo</Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Add text"
        onPress={onAddText}
        disabled={disabled}
        style={styles.btn}
      >
        <Icon name="plus" size={15} color={color.white} />
        <Text style={styles.text}>Text</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  text: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
});
