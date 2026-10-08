import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';

export function ToolTile(props: {
  label: string;
  icon: IconName;
  onPress: () => void;
  enabled?: boolean;
  active?: boolean;
}): JSX.Element {
  const { label, icon, onPress, enabled = true, active = false } = props;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled, selected: active }}
      disabled={!enabled}
      onPress={onPress}
      style={[styles.tile, !enabled && styles.tileOff]}
    >
      <View style={styles.iconWrap}>
        <Icon name={icon} size={22} color={active ? color.accent : color.white} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tileOff: { opacity: 0.38 },
  iconWrap: { height: 24, justifyContent: 'center' },
  label: { color: color.white, fontSize: type.size.micro11, fontWeight: type.weight.semibold },
});
