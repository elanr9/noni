// Admin handoff §8 — the small blue-100 AI action pill (Fill with AI,
// Regenerate, Rewrite, Library). Every AI action is a tap; nothing fires
// on its own.
import { StyleSheet, Text } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface AiPillProps {
  icon: IconName;
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function AiPill({ icon, label, busy = false, disabled = false, onPress }: AiPillProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.pill, (disabled || busy) && styles.dim]}
    >
      <Icon name={icon} size={13} color={color.blue700} />
      <Text style={styles.text}>{busy ? '…' : label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  dim: {
    opacity: 0.5,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
});
