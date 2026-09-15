import { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { companyLogoUrl } from '../../lib/companies-api';

export const COMPANY_TONES: readonly (readonly [string, string])[] = [
  ['#E3F2FD', '#0E6BA8'],
  ['#DFF3EE', '#0E6E5C'],
  ['#ECE7FB', '#5B44B4'],
  ['#FDEEDC', '#95560C'],
];

/** Stable tint per company so the same mark always reads the same colour. */
export function companyTone(companyId: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < companyId.length; i += 1) {
    hash = (hash * 31 + companyId.charCodeAt(i)) >>> 0;
  }
  return COMPANY_TONES[hash % COMPANY_TONES.length];
}

export interface CompanyMarkProps {
  companyId: string;
  name: string;
  logoPath?: string | null;
  /** Sizes in use: 22, 24, 26, 30, 36, 42. */
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Square company logo; first letter on the company tint until a logo exists. */
export function CompanyMark({
  companyId,
  name,
  logoPath,
  size = 22,
  radius,
  style,
}: CompanyMarkProps) {
  const [bg, fg] = companyTone(companyId);
  const url = companyLogoUrl(logoPath);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl !== null && failedUrl === url;
  const r = radius ?? Math.round(size * 0.32);
  const letter = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.box,
        { width: size, height: size, borderRadius: r, backgroundColor: bg },
        style,
      ]}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          onError={() => setFailedUrl(url)}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.letter, { color: fg, fontSize: Math.round(size * 0.5) }]}>
          {letter}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  letter: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
