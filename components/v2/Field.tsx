import type { ReactNode } from 'react';
import { Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { color, radius, shadow, text } from '../../theme/v2';

export interface FieldProps extends Omit<TextInputProps, 'style' | 'value' | 'onChange' | 'onChangeText'> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  /** Icon or button at the right edge of the card. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** White card input: padding 14 16, 400 15/20 ink, grey-3 placeholder, 12 below. */
export function Field({ value, onChange, label, placeholder, multiline, right, style, ...rest }: FieldProps) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? <Text style={[text.meta, { marginBottom: 6 }]}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={color.grey3}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
          style={{ flex: 1, padding: 0, margin: 0, fontSize: 15, lineHeight: 20, color: color.ink, minHeight: multiline ? 60 : 20, textAlignVertical: multiline ? 'top' : 'center' }}
        />
        {right}
      </View>
    </View>
  );
}
