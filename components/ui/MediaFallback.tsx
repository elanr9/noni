import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius as radiusToken, type } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';

export interface MediaFallbackProps {
  glyph: IconName;
  /** Duration or length, e.g. "0:52" | "4 slides". */
  label?: string;
  width?: number;
  radius?: number;
  glyphSize?: number;
  /** Distance of the label from the bottom edge (queue rows use 6). */
  labelOffset?: number;
  style?: StyleProp<ViewStyle>;
}

/** 9:16 quiet-fill placeholder used until real frames exist. */
export function MediaFallback({
  glyph,
  label,
  width,
  radius = radiusToken.sm,
  glyphSize = 18,
  labelOffset = 6,
  style,
}: MediaFallbackProps) {
  return (
    <View
      style={[
        styles.box,
        { borderRadius: radius },
        width !== undefined && { width },
        style,
      ]}
    >
      <Icon name={glyph} size={glyphSize} color={color.slate400} />
      {label !== undefined && (
        <Text numberOfLines={1} style={[styles.label, { bottom: labelOffset }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    aspectRatio: 9 / 16,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
  },
});
