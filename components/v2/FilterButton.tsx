import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, shadow } from '../../theme/v2';
import { Icon } from './Icon';
import { Press } from './Press';

export interface FilterButtonProps {
  onPress: () => void;
  /** Number of active filters; 0 renders the quiet white disc. */
  active?: number;
  /** 38 disc by default; the Briefs toolbar uses 48 with r16. */
  size?: number;
  radiusOverride?: number;
  style?: StyleProp<ViewStyle>;
}

/** White disc with the tune icon; blue with a white icon and an ink count badge when filters are active. */
export function FilterButton({ onPress, active = 0, size = 38, radiusOverride, style }: FilterButtonProps) {
  const on = active > 0;
  const big = size >= 44;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Filter and sort"
      style={[
        { width: size, height: size, borderRadius: radiusOverride ?? radius.pill, backgroundColor: on ? color.blue : color.card, alignItems: 'center', justifyContent: 'center' },
        on && !big ? null : shadow.card,
        style,
      ]}
    >
      <Icon name="tune" size={big ? 24 : 20} color={on ? color.white : color.ink} />
      {on ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: big ? 20 : 18,
            height: big ? 20 : 18,
            paddingHorizontal: big ? 6 : 5,
            borderRadius: radius.pill,
            backgroundColor: color.ink,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 0 2px ${color.bg}`,
          }}
        >
          <Text style={{ fontSize: big ? 12 : 11, lineHeight: big ? 20 : 18, fontWeight: '700', color: color.white }}>{active}</Text>
        </View>
      ) : null}
    </Press>
  );
}
