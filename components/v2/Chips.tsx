import { ScrollView, Text } from 'react-native';

import { color, radius, shadow, space } from '../../theme/v2';
import { Press } from './Press';

export interface ChipsProps<K extends string> {
  options: readonly K[];
  value: K;
  onChange: (key: K) => void;
}

/** Horizontal filter chips bleeding to the screen edge: 36 high, 600 15, blue with glow when on, white card otherwise. */
export function Chips<K extends string>({ options, value, onChange }: ChipsProps<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -space.screen, flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: space.screen, paddingTop: 2, paddingBottom: 4 }}
    >
      {options.map((o) => {
        const on = o === value;
        return (
          <Press
            key={o}
            onPress={() => onChange(o)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? color.blue : color.card, justifyContent: 'center', ...(on ? shadow.glow : shadow.card) }}
          >
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: on ? color.white : color.ink }}>
              {o}
            </Text>
          </Press>
        );
      })}
    </ScrollView>
  );
}
