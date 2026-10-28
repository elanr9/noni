import { Text, View } from 'react-native';

import { color, radius, text } from '../../theme/v2';
import { Icon } from './Icon';
import { Press } from './Press';

export interface OptionProps {
  on: boolean;
  onPress: () => void;
  children: string;
  meta?: string;
}

/** Selectable sheet option: grey-1 row r14, blue tint with a 2px blue inset ring and a check disc when on. */
export function Option({ on, onPress, children, meta }: OptionProps) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        minHeight: 56,
        paddingVertical: 10,
        borderRadius: radius.option,
        backgroundColor: on ? color.blueTint : color.grey1,
        marginBottom: 8,
        borderWidth: 2,
        borderColor: on ? color.blue : 'transparent',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[text.row, { color: on ? color.blueDeep : color.ink }]}>{children}</Text>
        {meta ? <Text style={text.meta}>{meta}</Text> : null}
      </View>
      <View style={{ width: 24, height: 24, borderRadius: radius.pill, backgroundColor: on ? color.blue : color.grey2, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Icon name="check" size={16} weight={700} color={color.white} /> : null}
      </View>
    </Press>
  );
}
