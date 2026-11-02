import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { text } from '../../theme/v2';

/** t-card heading between card groups, padding 12 4 8, optional meta on the right. */
export function SectionTitle({ children, right, style }: { children: string; right?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 4, paddingBottom: 8 }, style]}>
      <Text style={text.card}>{children}</Text>
      {right ? <Text style={text.meta}>{right}</Text> : null}
    </View>
  );
}
