import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color } from '../../../theme/tokens';

export interface CreatorAvatarProps {
  /** Real profile photo from the linked account. Initial-letter fallback when missing. */
  uri?: string | null;
  name: string;
  size?: number;
  /** Fallback tint: brand = blue-100/blue-700, quiet = fill-quiet/slate-500. */
  tone?: 'brand' | 'quiet';
  style?: StyleProp<ViewStyle>;
}

/** Admin handoff — real photo, initial-letter circle as fallback only. */
export function CreatorAvatar({ uri, name, size = 36, tone = 'brand', style }: CreatorAvatarProps) {
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <View style={[styles.clip, round, style]}>
        <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        round,
        tone === 'quiet' && { backgroundColor: color.fillQuiet },
        style,
      ]}
    >
      <Text
        style={[
          styles.initial,
          { fontSize: Math.round(size * 0.42) },
          tone === 'quiet' && { color: color.slate500 },
        ]}
      >
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    fontWeight: '700',
    color: color.blue700,
  },
});
