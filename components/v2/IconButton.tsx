import { Text, View } from 'react-native';

import { color, radius, shadow } from '../../theme/v2';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';

export interface IconButtonProps {
  name: IconName;
  label: string;
  onPress?: () => void;
  /** Blue count badge at the top right, 2px bg ring. */
  count?: number;
}

/** 44px white disc with the card shadow and a 24px ink icon: the header action. */
export function IconButton({ name, label, onPress, count }: IconButtonProps) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', ...shadow.card }}
    >
      <Icon name={name} size={24} color={color.ink} />
      {count ? (
        <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${color.bg}` }}>
          <Text style={{ fontSize: 12, lineHeight: 20, fontWeight: '700', color: color.white }}>{count}</Text>
        </View>
      ) : null}
    </Press>
  );
}
