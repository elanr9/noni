import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';

function ToolButton(props: {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}): JSX.Element {
  const { icon, label, accessibilityLabel, onPress, disabled = false } = props;
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

export function SlideTools(props: {
  onAddText: () => void;
  onCrop: () => void;
  onNotes: () => void;
  onRemove: () => void;
  canCrop: boolean;
  hasNotes: boolean;
}): JSX.Element {
  const { onAddText, onCrop, onNotes, onRemove, canCrop, hasNotes } = props;
  return (
    <View style={styles.root}>
      <ToolButton icon="plus" label="Text" accessibilityLabel="Add text" onPress={onAddText} />
      <ToolButton icon="crop" label="Crop" accessibilityLabel="Frame the photo" onPress={onCrop} disabled={!canCrop} />
      {hasNotes ? (
        <ToolButton icon="clipboard-paste" label="Notes" accessibilityLabel="Open brief notes" onPress={onNotes} />
      ) : null}
      <ToolButton icon="trash-2" label="Remove" accessibilityLabel="Remove slide" onPress={onRemove} />
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
