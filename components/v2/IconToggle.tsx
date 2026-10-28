import { View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius } from '../../theme/v2';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';

export interface IconToggleOption<K extends string> {
  key: K;
  icon: IconName;
  label: string;
}

export interface IconToggleProps<K extends string> {
  options: readonly IconToggleOption<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}

/** Grey-2 track r999 padding 3; 40x32 buttons; the selected one is an ink pill with a white icon. */
export function IconToggle<K extends string>({ options, value, onChange, style }: IconToggleProps<K>) {
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: color.grey2, borderRadius: radius.pill, padding: 3 }, style]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) onChange(o.key);
            }}
            haptic={!on}
            style={{ width: 40, height: 32, borderRadius: radius.pill, backgroundColor: on ? color.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={o.icon} size={19} color={on ? color.white : color.grey4} />
          </Press>
        );
      })}
    </View>
  );
}
