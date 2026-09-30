// Actions for the slide under the creator's thumb: swap the photo, add a
// text box, remove the slide.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

function ToolButton(props: {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
}): JSX.Element {
  const { icon, label, accessibilityLabel, onPress, disabled } = props;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, disabled && styles.btnOff]}
    >
      <Icon name={icon} size={15} color={color.white} />
      <Text style={styles.text}>{label}</Text>
    </PressableScale>
  );
}

export function SlideToolbar(props: {
  onAddText: () => void;
  onPickPhoto: () => void;
  onCrop: () => void;
  onRemoveSlide: () => void;
  disabled?: boolean;
  /** Removal stays visible but off when this is the only slide. */
  canRemove?: boolean;
  /** Crop stays visible but off until the slide has a photo. */
  canCrop?: boolean;
}): JSX.Element {
  const {
    onAddText,
    onPickPhoto,
    onCrop,
    onRemoveSlide,
    disabled = false,
    canRemove = true,
    canCrop = true,
  } = props;
  return (
    <View style={styles.root}>
      <ToolButton
        icon="image"
        label="Photo"
        accessibilityLabel="Replace photo"
        onPress={onPickPhoto}
        disabled={disabled}
      />
      <ToolButton
        icon="crop"
        label="Crop"
        accessibilityLabel="Adjust crop"
        onPress={onCrop}
        disabled={disabled || !canCrop}
      />
      <ToolButton
        icon="plus"
        label="Text"
        accessibilityLabel="Add text"
        onPress={onAddText}
        disabled={disabled}
      />
      <ToolButton
        icon="trash-2"
        label="Remove"
        accessibilityLabel="Remove slide"
        onPress={onRemoveSlide}
        disabled={disabled || !canRemove}
      />
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
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  btnOff: {
    opacity: 0.45,
  },
  text: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
});
