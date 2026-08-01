import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import type { TrendItem } from '../../lib/tasks-api';
import { color, motion, shadow } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { MediaCard } from '../ui/MediaCard';
import { PressableScale } from '../ui/PressableScale';
import { formatViews } from './PostCard';

export interface SwapSheetProps {
  visible: boolean;
  /** Pager label of the slot being swapped (e.g. "Post 3"). */
  slotLabel: string;
  format: 'video' | 'photo_carousel';
  trends: TrendItem[];
  onPick: (trend: TrendItem) => void;
  onClose: () => void;
}

function trendTitle(trend: TrendItem): string {
  return trend.hook ?? trend.why_it_works ?? 'Trending post';
}

function trendMeta(trend: TrendItem): string | undefined {
  const handle = trend.author_handle !== null ? `@${trend.author_handle.replace(/^@/, '')}` : null;
  const views = trend.views !== null ? `${formatViews(trend.views)} views` : null;
  if (handle !== null && views !== null) return `${handle} · ${views}`;
  return handle ?? views ?? undefined;
}

export function SwapSheet({
  visible,
  slotLabel,
  format,
  trends,
  onPick,
  onClose,
}: SwapSheetProps) {
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShown(false);
      });
    }
  }, [visible, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  const rows: TrendItem[][] = [];
  for (let i = 0; i < trends.length; i += 2) {
    rows.push(trends.slice(i, i + 2));
  }

  return (
    <Modal visible={shown} transparent statusBarTranslucent animationType="none">
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            accessibilityLabel="Close swap sheet"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            shadow.shadowRaised,
            { maxHeight: height * 0.78, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Swap this post</Text>
              <Text style={styles.sub}>
                Same format, same pillars as the {slotLabel} slot.
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="x" size={18} color={color.slate500} />
            </PressableScale>
          </View>

          <View style={styles.chips}>
            <View style={styles.chip}>
              <Icon name="check" size={13} color={color.blue700} />
              <Text style={styles.chipText}>
                {format === 'photo_carousel' ? 'Slideshow' : 'Reel'}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {trends.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title="No ideas yet"
                body="New trends land here soon. Keep what you have for now."
                compact
              />
            ) : (
              rows.map((row) => (
                <View key={row[0].id} style={styles.gridRow}>
                  {row.map((trend) => (
                    <View key={trend.id} style={styles.gridCell}>
                      <MediaCard
                        variant="tile"
                        mediaHeight={150}
                        title={trendTitle(trend)}
                        meta={trendMeta(trend)}
                        format={format === 'photo_carousel' ? 'slideshow' : 'reel'}
                        thumbnail={trend.cover_url ?? undefined}
                        onPress={() => onPick(trend)}
                      />
                    </View>
                  ))}
                  {row.length === 1 && <View style={styles.gridCell} />}
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button variant="ghost" size="md" block onPress={onClose}>
              Keep what I have
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.scrim,
  },
  panel: {
    backgroundColor: color.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 26,
  },
  grabberWrap: {
    paddingTop: 10,
    alignItems: 'center',
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: color.lineStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  sub: {
    fontSize: 14,
    lineHeight: 21,
    color: color.slate500,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: color.blue100,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.blue700,
  },
  grid: {
    paddingHorizontal: 24,
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCell: {
    flex: 1,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 24,
  },
});
