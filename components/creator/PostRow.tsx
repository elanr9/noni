import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { earningsForViews, formatCount } from '../../lib/earnings';
import type { TaskStatus } from '../../lib/tasks';
import { color, radius, shadow, type } from '../../theme/tokens';
import { StatusChip } from '../ui/StatusChip';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

/**
 * The post row every Posts list shares (SCREENS §4): white card, 40px thumb,
 * meta row (platform icon · date · time · Top {n}% chip), 1-line title,
 * views + likes, earnings line with the $20-tier progress bar.
 */

export interface PostRowProps {
  title: string;
  /** Static photo/carousel posts show the images glyph instead of play. */
  isPhoto: boolean;
  /** "09:00" */
  time: string;
  /** "28 Jul" — rendered before the time when provided (list view). */
  date?: string;
  platform?: 'tiktok' | 'instagram';
  views: number;
  likes: number;
  /** "Top {n}%" green chip renders when this is 10 or under. */
  topPercent?: number;
  /** Rows that are not live yet show a status chip and hide the numbers. */
  status?: TaskStatus;
  onPress?: () => void;
}

export function PostRow({
  title,
  isPhoto,
  time,
  date,
  platform = 'tiktok',
  views,
  likes,
  topPercent,
  status,
  onPress,
}: PostRowProps) {
  const live = status === undefined || status === 'posted' || status === 'approved';
  const { earned, next, toGo } = earningsForViews(views);
  const fillPercent = ((earned % 20) / 20) * 100;
  const showTopChip = topPercent !== undefined && topPercent <= 10;

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
              <Stop offset="0" stopColor={color.blue100} />
              <Stop offset="1" stopColor={color.mediaGradEnd} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#postRowThumb)" />
        </Svg>
        <Icon name={isPhoto ? 'images' : 'play'} size={15} color={color.slate400} />
      </View>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Icon
            name={platform === 'instagram' ? 'at-sign' : 'music-2'}
            size={13}
            color={color.slate400}
          />
          <Text style={styles.meta}>
            {date !== undefined ? `${date} · ${time}` : time}
          </Text>
          {showTopChip && (
            <View style={styles.topChip}>
              <Icon name="trending-up" size={11} color={color.green} />
              <Text style={styles.topChipText}>{`Top ${topPercent}%`}</Text>
            </View>
          )}
          {status !== undefined && !live && (
            <View style={styles.chipSlot}>
              <StatusChip status={status} />
            </View>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {live && (
          <>
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
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
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
    minWidth: 0,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  topChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
  },
  topChipText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.green,
  },
  chipSlot: {
    marginLeft: 'auto',
  },
  title: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    lineHeight: type.size.meta * type.leading.snug,
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
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amount: {
    fontSize: type.size.chip,
    fontWeight: type.weight.heavy,
    color: color.green,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: color.green,
  },
  toGo: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
});
