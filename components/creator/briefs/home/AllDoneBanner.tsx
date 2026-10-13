// Green banner above the main card once nothing is left to make today.
// From SSCreator.jsx CreatorHome.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';

export function AllDoneBanner({
  posted,
  inReview,
  nextDay,
}: {
  posted: number;
  inReview: number;
  /** Weekday name of the next scheduled post, when there is one. */
  nextDay: string | null;
}): JSX.Element {
  const line = `${posted} posted, ${inReview} in review.${nextDay ? ` Next post ${nextDay}.` : ''}`;
  return (
    <View style={styles.banner}>
      <View style={styles.check}>
        <Icon name="check" size={18} color={color.white} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>All done for today</Text>
        <Text style={styles.sub}>{line}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: color.greenSoft,
  },
  check: { width: 36, height: 36, borderRadius: 999, backgroundColor: color.green, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700', color: color.ink },
  sub: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '500', color: color.slate500 },
});
