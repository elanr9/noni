import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { formatCount } from '../../lib/earnings';
import type { TaskStatus } from '../../lib/tasks';
import { color, radius, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

export interface PostGridTileProps {
  status: TaskStatus;
  isPhoto: boolean;
  views: number;
  onPress: () => void;
  width: number;
}

function statusDotColor(status: TaskStatus): string {
  if (status === 'posted' || status === 'approved') return color.green;
  if (status === 'submitted' || status === 'changes_requested') return color.amber;
  return color.blue500;
}

export function PostGridTile({
  status,
  isPhoto,
  views,
  onPress,
  width,
}: PostGridTileProps) {
  const todo = status === 'assigned' || status === 'changes_requested';
  const height = Math.round((width * 16) / 9);

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tile, { width, height }]}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="gridTilePh" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={color.blue100} />
            <Stop offset="1" stopColor={color.lineStrong} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#gridTilePh)" />
      </Svg>

      <View style={styles.badge}>
        <View style={[styles.dot, { backgroundColor: statusDotColor(status) }]} />
        <Icon name={isPhoto ? 'images' : 'play'} size={11} color={color.ink} />
      </View>

      {todo ? (
        <View style={styles.todoPill}>
          <Text style={styles.todoText}>To do</Text>
        </View>
      ) : (
        <View style={styles.viewsPill}>
          <Icon name="play" size={11} color={color.white} />
          <Text style={styles.viewsText}>{formatCount(views)}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  viewsPill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,32,0.62)',
  },
  viewsText: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.white,
  },
  todoPill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color.blue500,
  },
  todoText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.heavy,
    color: color.white,
  },
});
