import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { earningsForViews, formatCount } from '../../lib/earnings';
import { color, shadow } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

export interface PostRowProps {
  platform: string | null;
  /** "08:30" */
  time: string;
  /** "29 Jul" — rendered before the time when provided (list view). */
  date?: string;
  title: string;
  views: number;
  likes: number;
  /** Static photo/carousel posts show the images glyph instead of play. */
  isPhoto: boolean;
  onPress?: () => void;
}

export function PostRow({
  platform,
  time,
  date,
  title,
  views,
  likes,
  isPhoto,
  onPress,
}: PostRowProps) {
  const { earned, next, toGo } = earningsForViews(views);
  const fillPercent = ((earned % 20) / 20) * 100;
  const isInstagram = (platform ?? '').toLowerCase().includes('insta');

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <View style={styles.thumb}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="postRowThumb" x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor="#E7F4FD" />
              <Stop offset="1" stopColor="#DCE7F0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#postRowThumb)" />
        </Svg>
        <Icon name={isPhoto ? 'images' : 'play'} size={15} color={color.slate400} />
      </View>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Icon
            name={isInstagram ? 'at-sign' : 'music-2'}
            size={13}
            color={color.slate400}
          />
          <Text style={styles.meta}>{date !== undefined ? `${date} · ${time}` : time}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Icon name="eye" size={13} color={color.slate500} />
            <Text style={styles.statText}>{formatCount(views)}</Text>
          </View>
          <View style={styles.stat}>
            <Icon name="zap" size={13} color={color.slate500} />
            <Text style={styles.statText}>{formatCount(likes)}</Text>
          </View>
        </View>
        <View style={styles.earningsRow}>
          <Text style={styles.amount}>{`$${earned.toFixed(2)}`}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${fillPercent}%` }]} />
          </View>
          <Text style={styles.toGo} numberOfLines={1}>
            {`${formatCount(toGo)} views to $${next}`}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  thumb: {
    width: 40,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18.9,
    letterSpacing: -0.2,
    color: color.ink,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate500,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amount: {
    fontSize: 13,
    fontWeight: '800',
    color: color.green,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: color.green,
  },
  toGo: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate500,
  },
});
