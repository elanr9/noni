import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SkeletonLine } from '../ui/Skeleton';
import { borderWidth, color, radius, shadow } from '../../theme/tokens';

/** Queue loading placeholder — README §4.5, same card shell as QueueRow. */
export function QueueSkeletonRow(): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.thumb}>
        <SkeletonLine radius={radius.sm} style={StyleSheet.absoluteFillObject} />
      </View>
      <View style={styles.lines}>
        <SkeletonLine width="52%" height={12} radius={6} />
        <SkeletonLine width="92%" height={14} radius={7} />
        <SkeletonLine width="64%" height={14} radius={7} />
        <SkeletonLine width="34%" height={22} radius={radius.pill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    ...shadow.shadowCard,
  },
  thumb: {
    width: 56,
    aspectRatio: 9 / 16,
  },
  lines: {
    flex: 1,
    gap: 9,
  },
});
