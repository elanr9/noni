import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space } from '../../theme/tokens';
import { Screen } from '../layout/Screen';
import { SkeletonCard, SkeletonLine } from '../ui/Skeleton';

export interface SkeletonBlockProps {
  style?: StyleProp<ViewStyle>;
}

/** Home tab loading: greeting + streak + hero frame. */
export function HomeSkeleton({ style }: SkeletonBlockProps) {
  return (
    <Screen contentStyle={[styles.pad, style]}>
      <SkeletonLine width="48%" height={34} radius={10} />
      <SkeletonLine width={120} height={28} radius={radius.pill} />
      <SkeletonLine width="36%" height={12} radius={6} />
      <SkeletonCard height={470} radius={radius.xl} style={styles.hero} />
      <SkeletonLine width="100%" height={60} radius={radius.pill} />
    </Screen>
  );
}

/** Posts tab loading: month header + day rows. */
export function PostsSkeleton({ style }: SkeletonBlockProps) {
  return (
    <View style={[styles.stack, style]}>
      <SkeletonCard height={280} radius={radius.lg} />
      <SkeletonLine width="40%" height={16} radius={6} />
      <SkeletonCard height={120} radius={radius.lg} />
      <SkeletonCard height={120} radius={radius.lg} />
    </View>
  );
}

/** Analytics tab loading: stats + chart. */
export function AnalyticsSkeleton({ style }: SkeletonBlockProps) {
  return (
    <View style={[styles.stack, style]}>
      <View style={styles.row}>
        <SkeletonCard height={110} radius={radius.lg} style={styles.flex} />
        <SkeletonCard height={110} radius={radius.lg} style={styles.flex} />
      </View>
      <SkeletonCard height={120} radius={radius.lg} />
      <SkeletonCard height={80} radius={radius.lg} />
    </View>
  );
}

/** Profile header + account rows. */
export function ProfileSkeleton({ style }: SkeletonBlockProps) {
  return (
    <View style={[styles.stack, style]}>
      <View style={styles.profileHead}>
        <SkeletonLine width={72} height={72} radius={radius.pill} />
        <SkeletonLine width="46%" height={22} radius={8} />
        <SkeletonLine width="32%" height={14} radius={6} />
      </View>
      <SkeletonCard height={64} radius={radius.lg} />
      <SkeletonCard height={64} radius={radius.lg} />
      <SkeletonCard height={96} radius={radius.lg} />
    </View>
  );
}

/** Post detail / record / upload loading shell. */
export function DetailSkeleton({ style }: SkeletonBlockProps) {
  return (
    <Screen contentStyle={[styles.pad, style]}>
      <SkeletonLine width={40} height={40} radius={radius.pill} />
      <SkeletonLine width="70%" height={26} radius={8} />
      <SkeletonLine width="40%" height={14} radius={6} />
      <SkeletonCard height={160} radius={radius.lg} />
      <SkeletonCard height={96} radius={radius.lg} />
      <SkeletonCard height={96} radius={radius.lg} />
      <SkeletonLine width="100%" height={60} radius={radius.pill} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: {
    gap: space[5],
    paddingTop: space[3],
  },
  stack: {
    gap: space[4],
  },
  row: {
    flexDirection: 'row',
    gap: space[3],
  },
  flex: {
    flex: 1,
  },
  hero: {
    width: 264,
    alignSelf: 'center',
  },
  profileHead: {
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
  },
});
