import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';

export interface BestHookRowProps {
  rank: number;
  hook: string;
  views: string;
}

/** Admin handoff §11 — best hooks: rank bubble, the hook, views. */
export function BestHookRow({ rank, hook, views }: BestHookRowProps) {
  return (
    <View style={[styles.row, shadow.shadowCard]}>
      <View style={styles.rank}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <Text style={styles.hook} numberOfLines={2}>
        {hook}
      </Text>
      <Text style={styles.views}>{views}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 64,
    paddingHorizontal: 12,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  rank: {
    width: 24,
    height: 24,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: type.size.micro11,
    fontWeight: '700',
    color: color.blue700,
  },
  hook: {
    flex: 1,
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.ink,
    lineHeight: type.size.chip * type.leading.snug,
  },
  views: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
});
