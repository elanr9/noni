import { StyleSheet, Text, View } from 'react-native';

import { statusDotColor } from '../../lib/creator-queue';
import type { TaskStatus } from '../../lib/tasks';
import { color, radius, shadow, type } from '../../theme/tokens';
import { PressableScale } from '../ui/PressableScale';

/**
 * Home time pager (SCREENS §1): pill track on fillQuiet with one pill per
 * slot. Label is the post time (slotTimeLabel from lib/creator-queue),
 * leading 7px status dot, selected pill white with shadowCard.
 */

export interface PostPagerItem {
  key: string;
  /** Post time, e.g. "08:30". */
  label: string;
  status: TaskStatus;
}

export interface PostPagerProps {
  items: PostPagerItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

export function PostPager({ items, selectedKey, onSelect }: PostPagerProps) {
  return (
    <View style={styles.track}>
      {items.map((item) => {
        const selected = item.key === selectedKey;
        return (
          <PressableScale
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`Post at ${item.label}`}
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.key)}
            style={[styles.pill, selected && [styles.pillSelected, shadow.shadowCard]]}
          >
            <View style={[styles.dot, { backgroundColor: statusDotColor(item.status) }]} />
            <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  pillSelected: {
    backgroundColor: color.white,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  labelSelected: {
    color: color.ink,
  },
});
