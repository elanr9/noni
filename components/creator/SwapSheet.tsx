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

import type { Brief } from '../../lib/tasks-api';
import { color, motion, shadow } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { MediaCard } from '../ui/MediaCard';
import { PressableScale } from '../ui/PressableScale';

export interface SwapSheetProps {
  visible: boolean;
  /** The creator's unassigned briefs from this week's published campaign. */
  briefs: Brief[];
  loading: boolean;
  onPick: (brief: Brief) => void;
  onClose: () => void;
}

export function SwapSheet({
  visible,
  briefs,
  loading,
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

  const rows: Brief[][] = [];
  for (let i = 0; i < briefs.length; i += 2) {
    rows.push(briefs.slice(i, i + 2));
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
                Trade it for one of your spare briefs from this week.
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

          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {loading || briefs.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title={loading ? 'Finding your spares' : 'No spare briefs'}
                body={
                  loading
                    ? 'One second.'
                    : 'Every brief in this week is already on your calendar.'
                }
                compact
              />
            ) : (
              rows.map((row) => (
                <View key={row[0].id} style={styles.gridRow}>
                  {row.map((brief) => (
                    <View key={brief.id} style={styles.gridCell}>
                      <MediaCard
                        variant="tile"
                        mediaHeight={150}
                        title={brief.title}
                        meta={brief.hook ?? undefined}
                        format={
                          brief.format === 'photo_carousel' ? 'slideshow' : 'reel'
                        }
                        onPress={() => onPick(brief)}
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
  grid: {
    paddingTop: 4,
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
