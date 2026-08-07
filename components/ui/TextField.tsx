import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { borderWidth, color, radius, space, type } from '../../theme/tokens';

export type TextFieldProps = TextInputProps;

export function TextField({ style, ...props }: TextFieldProps) {
  return (
    <TextInput
      placeholderTextColor={color.textSubtle}
      {...props}
      style={[styles.field, style]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: space.tapMin,
    borderRadius: radius.sm,
    borderWidth: borderWidth.field,
    borderColor: color.border,
    backgroundColor: color.surfaceQuiet,
    paddingHorizontal: space[6],
    paddingVertical: space[5],
    fontSize: type.size.body,
    fontWeight: type.weight.semibold,
    color: color.textStrong,
  },
});
