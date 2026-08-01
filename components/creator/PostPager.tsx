import { StyleSheet, Text, View } from 'react-native';

import type { TaskStatus } from '../../lib/tasks';
import { color, shadow } from '../../theme/tokens';
import { PressableScale } from '../ui/PressableScale';

export interface PagerItem {
  id: string;
  label: string;
  status: TaskStatus;
}

export interface PostPagerProps {
  items: PagerItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function dotColor(status: TaskStatus): string {
  if (status === 'posted' || status === 'approved') return color.green;
  if (status === 'submitted' || status === 'recorded') return color.amber;
  return color.blue300;
}

export function PostPager({ items, selectedIndex, onSelect }: PostPagerProps) {
  return (
    <View style={styles.track}>
      {items.map((item, index) => {
        const active = index === selectedIndex;
        return (
          <PressableScale
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(index)}
            style={[styles.item, active && [styles.itemActive, shadow.shadowCard]]}
          >
            <View style={[styles.dot, { backgroundColor: dotColor(item.status) }]} />
            <Text style={[styles.label, { color: active ? color.ink : color.slate500 }]}>
              {item.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 999,
  },
  itemActive: {
    backgroundColor: color.white,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});
