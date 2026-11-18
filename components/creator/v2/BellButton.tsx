import { Text, View } from 'react-native';

import { color, radius, shadow } from '../../../theme/v2';
import { Press } from '../../v2';
import { Icon, type IconName } from '../../v2/Icon';

/** 40px white disc with the bell; a blue count when there are unread notifications in any company. */
export function BellButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      onPress={onPress}
      style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', ...shadow.card }}
    >
      <Icon name="notifications" size={21} color={color.ink} />
      {count > 0 ? (
        <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${color.bg}` }}>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.white }}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Press>
  );
}
