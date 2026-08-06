// Admin handoff §7 — the sum banner. Green with a check when the split
// matches the target, amber with what to fix when it does not.
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface SumBannerProps {
  assigned: number;
  target: number;
  /** "videos" or "slideshows". */
  noun: string;
}

export function SumBanner({ assigned, target, noun }: SumBannerProps) {
  const matched = assigned === target;
  const over = assigned - target;
  const text = matched
    ? `${assigned} of ${target} ${noun} assigned`
    : over > 0
      ? `${over} over. Take ${over} off a type.`
      : `${-over} left. Add ${-over} to a type.`;

  return (
    <View style={[styles.banner, matched ? styles.bannerOk : styles.bannerOff]}>
      {matched && <Icon name="circle-check-big" size={16} color={color.green} />}
      <Text style={[styles.text, { color: matched ? color.green : color.amber }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.md,
  },
  bannerOk: {
    backgroundColor: color.greenSoft,
  },
  bannerOff: {
    backgroundColor: color.amberSoft,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
});
