import { Text, type StyleProp, type TextStyle } from 'react-native';

import { color } from '../../theme/v2';

/** Section label: 600 13 grey-4, uppercase, 0.4 tracking. */
export function Label({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.grey4, textTransform: 'uppercase', letterSpacing: 0.4 }, style]}>{children}</Text>;
}
