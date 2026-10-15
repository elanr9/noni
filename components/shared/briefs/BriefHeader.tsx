// SHeader from reference_ui/briefs/SSShared.jsx: 40pt round back button on a
// card shadow, 19pt display title, 13pt slate subtitle, optional right slot.
// Padding 8 20 12. Hit target is padded to 44.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../ui/Icon';
import { color, shadow, type as typeToken } from '../../../theme/tokens';

export interface BriefHeaderProps {
  title: string;
  sub?: string;
  onBack: () => void;
  right?: ReactNode;
  /** Single line title with ellipsis instead of wrapping. */
  noWrap?: boolean;
  /** White on dark canvases. */
  dark?: boolean;
}

export function BriefHeader({ title, sub, onBack, right, noWrap = false, dark = false }: BriefHeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={2}
        style={({ pressed }) => [styles.back, dark ? styles.backDark : styles.backLight, pressed ? styles.pressed : null]}
      >
        <Icon name="chevron-left" size={20} color={dark ? color.white : color.ink} />
      </Pressable>
      <View style={styles.body}>
        <Text numberOfLines={noWrap ? 1 : undefined} style={[styles.title, { color: dark ? color.white : color.ink }]}>
          {title}
        </Text>
        {sub ? <Text style={[styles.sub, { color: dark ? color.whiteA60 : color.slate500 }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function HeaderIconButton({
  icon,
  label,
  onPress,
  dark = false,
}: {
  icon: 'message-circle' | 'bell' | 'x' | 'eye' | 'sparkles';
  label: string;
  onPress: () => void;
  dark?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => [styles.back, dark ? styles.backDark : styles.backLight, pressed ? styles.pressed : null]}
    >
      <Icon name={icon} size={19} color={dark ? color.white : color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 8, paddingBottom: 12, paddingHorizontal: 20 },
  back: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  backLight: { backgroundColor: color.white, ...shadow.shadowCard },
  backDark: { backgroundColor: color.whiteA16 },
  pressed: { opacity: 0.8 },
  body: { flex: 1, minWidth: 0, paddingTop: 2 },
  title: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 19, lineHeight: 23, letterSpacing: -0.3 },
  sub: { marginTop: 1, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13 },
});
