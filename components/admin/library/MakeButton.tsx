import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface MakeButtonProps {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** 34 tall quiet pill. Busy turns blue-100 with a spinner and "Making". */
export function MakeButton({ label, busy = false, disabled = false, onPress }: MakeButtonProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.button, busy && styles.busy, disabled && !busy && styles.disabled]}
    >
      {busy && <ActivityIndicator size="small" color={color.blue700} />}
      <Text style={[styles.text, busy && styles.textBusy]}>{busy ? 'Making' : label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 62,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: color.fillQuiet,
  },
  busy: {
    backgroundColor: color.blue100,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.ink,
  },
  textBusy: {
    color: color.blue700,
  },
});
