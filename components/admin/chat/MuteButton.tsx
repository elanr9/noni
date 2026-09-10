import { StyleSheet } from 'react-native';

import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { color, shadow } from '../../../theme/tokens';

interface MuteButtonProps {
  muted: boolean;
  onToggle: () => void;
}

export function MuteButton({ muted, onToggle }: MuteButtonProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Unmute notifications' : 'Mute notifications'}
      onPress={onToggle}
      hitSlop={4}
      style={[styles.button, shadow.shadowCard]}
    >
      <Icon
        name={muted ? 'volume-x' : 'bell'}
        size={18}
        color={muted ? color.textMuted : color.ink}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
