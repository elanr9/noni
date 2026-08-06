import { StyleSheet, View } from 'react-native';

import { radiusAdmin } from '../../../theme/tokens';
import { SkeletonCard } from '../shared';

export interface LibraryListSkeletonProps {
  /** Matches the fixed card height of the list it stands in for. */
  height: number;
  count?: number;
}

/** Shimmering placeholder rows while a library list loads. */
export function LibraryListSkeleton({ height, count = 4 }: LibraryListSkeletonProps) {
  return (
    <View style={styles.column}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} height={height} radius={radiusAdmin.lg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: 10,
  },
});
