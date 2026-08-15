import type { ReactNode } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScreenEnter } from '../../layout/Screen';
import { color, space } from '../../../theme/tokens';

export interface AdminScreenProps {
  children: ReactNode;
  /** Pinned above the bottom edge; the scrolling column runs behind it. */
  actionBar?: ReactNode;
  /** Set false for screens that manage their own scrolling (e.g. FlatList). */
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Admin handoff §1 scaffold — off-white ground, 20px gutter, pinned action bar. */
export function AdminScreen({
  children,
  actionBar,
  scroll = true,
  refreshControl,
  contentStyle,
}: AdminScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = actionBar ? 120 : space[8];
  const enterStyle = useScreenEnter();

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <Animated.View style={[styles.fill, enterStyle]}>
        {scroll ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
            contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, contentStyle]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, contentStyle]}>{children}</View>
        )}

        {actionBar !== undefined && (
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {actionBar}
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.gutterAdmin,
    paddingTop: space[2],
  },
  actionBar: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.gutterAdmin,
    paddingTop: 12,
    backgroundColor: color.glass,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
});
