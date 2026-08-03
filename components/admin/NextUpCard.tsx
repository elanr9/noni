import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../theme/tokens';

/** Queue "one left" note card — README §4.6. */
export function NextUpCard({ inFlight = 0 }: { inFlight?: number }): React.JSX.Element {
  const body =
    inFlight > 0
      ? `${inFlight} task${inFlight === 1 ? '' : 's'} still with creators.`
      : 'The next batch lands when creators submit.';

  return (
    <View style={styles.card}>
      <Text style={styles.label}>NEXT UP</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.offWhite,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  label: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  body: {
    marginTop: 8,
    fontSize: type.size.bodySm,
    lineHeight: 21,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
});
