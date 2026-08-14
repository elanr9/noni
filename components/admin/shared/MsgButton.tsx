import { StyleSheet, Text, View } from 'react-native';

import { color, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface MsgButtonProps {
  count?: number;
  onPress: () => void;
}

/** 38px messages entry. Lives top right on every Briefs surface. */
export function MsgButton({ count = 0, onPress }: MsgButtonProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Messages, ${count} unread` : 'Messages'}
      hitSlop={6}
      onPress={onPress}
      style={[styles.btn, shadow.shadowCard]}
    >
      <Icon name="message-circle" size={18} color={color.ink} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99' : String(count)}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'relative',
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.offWhite,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: color.white,
  },
});
