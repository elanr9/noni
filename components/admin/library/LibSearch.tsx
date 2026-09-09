import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface LibSearchProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}

/** Quiet 38 tall search pill with a clear button once there is text. */
export function LibSearch({ value, onChangeText, placeholder }: LibSearchProps) {
  return (
    <View style={styles.pill}>
      <Icon name="search" size={15} color={color.slate400} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.slate400}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          hitSlop={8}
        >
          <Icon name="x" size={14} color={color.slate400} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '500',
    color: color.ink,
  },
});
