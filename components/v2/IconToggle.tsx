import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { color, motion, radius } from '../../theme/v2';
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

const W = 40;
const PAD = 3;

/** Grey-2 track r999 padding 3; 40x32 buttons; an ink pill slides under the selected one, whose icon is white. */
export function IconToggle<K extends string>({ options, value, onChange, style }: IconToggleProps<K>) {
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const x = useSharedValue(index * W);
  useEffect(() => {
    x.set(withSpring(index * W, motion.settle));
  }, [index, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: color.grey2, borderRadius: radius.pill, padding: PAD }, style]}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: PAD, left: PAD, width: W, height: 32, borderRadius: radius.pill, backgroundColor: color.ink }, pill]} />
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
            style={{ width: W, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={o.icon} size={19} color={on ? color.white : color.grey4} />
          </Press>
        );
      })}
    </View>
  );
}
