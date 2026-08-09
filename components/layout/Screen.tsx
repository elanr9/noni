import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, space, type } from '../../theme/tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Pinned above the home indicator; typically a full-width Button. */
  footer?: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  bg?: string;
}

export function Screen({
  children,
  footer,
  scroll = false,
  style,
  contentStyle,
  edges = ['top', 'left', 'right'],
  bg = color.white,
}: ScreenProps) {
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.gutter, styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.gutter, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }, style]} edges={edges}>
      {body}
      {footer !== undefined && (
        <View style={[styles.footer, styles.gutter]}>{footer}</View>
      )}
    </SafeAreaView>
  );
}

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <Screen contentStyle={styles.center}>
      <ActivityIndicator size="large" color={color.accent} />
      <Text style={styles.muted}>{label}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  gutter: {
    paddingHorizontal: space.gutter,
  },
  scrollContent: {
    paddingTop: space[5],
    paddingBottom: space[9],
    flexGrow: 1,
  },
  footer: {
    paddingTop: space[3],
    paddingBottom: space[5],
    gap: space[3],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  muted: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.textMuted,
  },
});
