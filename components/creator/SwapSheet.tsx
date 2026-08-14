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
import { useVideoPlayer, VideoView } from 'expo-video';

import type { Brief } from '../../lib/tasks-api';
import { color, motion, radius, shadow, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { FormatTag } from './Chips';
import { estimateDurationLabel, exampleHandle, scriptBlocks } from './PostCard';
import { SlideNav } from './SlideNav';

export interface SwapSheetProps {
  visible: boolean;
  /** Format of the post being swapped; titles the sheet reel or slideshow. */
  format: string;
  /** The rest of this brief's post library (listSwapPool). */
  briefs: Brief[];
  loading: boolean;
  /** Called after Use this post; the caller swaps, toasts and closes. */
  onPick: (brief: Brief) => void;
  onClose: () => void;
}

function sourceLine(brief: Brief): string | null {
  return exampleHandle(brief.example_url);
}

function PreviewMedia({ brief }: { brief: Brief }) {
  const slideshow = brief.format === 'photo_carousel';
  const videoSource = !slideshow ? brief.example_url : null;
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
  });
  const [playing, setPlaying] = useState(false);

  const togglePlay = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  };

  return (
    <View style={styles.previewMedia}>
      {slideshow ? (
        <SlideNav
          variant="dark"
          slides={scriptBlocks(brief.script).map((text) => ({ text }))}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <>
          {videoSource !== null ? (
            <VideoView
              style={StyleSheet.absoluteFill}
              player={player}
              contentFit="cover"
              nativeControls={false}
            />
          ) : null}
          <View style={styles.previewCenter} pointerEvents="box-none">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause example' : 'Play example'}
              onPress={togglePlay}
              style={styles.playBtn}
            >
              <Icon name={playing ? 'pause' : 'play'} size={22} color={color.ink} />
            </PressableScale>
          </View>
          <Text style={styles.previewHook} numberOfLines={2}>
            {brief.hook ?? brief.title}
          </Text>
        </>
      )}

      <View style={styles.previewTags} pointerEvents="none">
        <FormatTag format={brief.format} />
        {estimateDurationLabel(brief) !== undefined ? (
          <View style={styles.durationPill}>
            <Text style={styles.durationText}>{estimateDurationLabel(brief)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function SwapSheet({
  visible,
  format,
  briefs,
  loading,
  onPick,
  onClose,
}: SwapSheetProps) {
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState(visible);
  const [preview, setPreview] = useState<Brief | null>(null);
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
      setPreview(null);
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

  const noun = format === 'photo_carousel' ? 'slideshow' : 'reel';

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
            { height: height * 0.88, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Swap this {noun}</Text>
              <Text style={styles.sub}>
                The rest of this brief&apos;s post library.
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
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {loading || briefs.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title={loading ? 'Finding your spares' : 'No spare posts'}
                body={
                  loading
                    ? 'One second.'
                    : 'Every post in this library is already on your calendar.'
                }
                compact
              />
            ) : (
              briefs.map((brief) => {
                const source = sourceLine(brief);
                return (
                  <PressableScale
                    key={brief.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${brief.title}`}
                    onPress={() => setPreview(brief)}
                    style={[styles.row, shadow.shadowCard]}
                  >
                    <View style={styles.thumb}>
                      <Icon
                        name={brief.format === 'photo_carousel' ? 'images' : 'play'}
                        size={16}
                        color={color.blue600}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {brief.title}
                      </Text>
                      <View style={styles.rowMeta}>
                        <FormatTag format={brief.format} />
                        {source !== null ? (
                          <Text style={styles.rowSource} numberOfLines={1}>
                            {source}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Icon name="chevron-right" size={18} color={color.slate300} />
                  </PressableScale>
                );
              })
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button variant="ghost" size="md" block onPress={onClose}>
              Keep what I have
            </Button>
          </View>

          {preview !== null ? (
            <View style={styles.previewScrim}>
              <Pressable
                accessibilityLabel="Back"
                style={StyleSheet.absoluteFill}
                onPress={() => setPreview(null)}
              />
              <View style={[styles.previewCard, shadow.shadowRaised]}>
                <PreviewMedia brief={preview} />
                <View style={styles.previewText}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {preview.title}
                  </Text>
                  {sourceLine(preview) !== null ? (
                    <Text style={styles.previewSource}>{sourceLine(preview)}</Text>
                  ) : null}
                  {preview.why_it_works !== null &&
                  preview.why_it_works.length > 0 ? (
                    <Text style={styles.previewWhy} numberOfLines={3}>
                      {preview.why_it_works}
                    </Text>
                  ) : null}
                </View>
                <Button
                  variant="primary"
                  size="md"
                  block
                  icon="check"
                  onPress={() => onPick(preview)}
                >
                  Use this post
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  block
                  onPress={() => setPreview(null)}
                >
                  Back
                </Button>
              </View>
            </View>
          ) : null}
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
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingBottom: 26,
    overflow: 'hidden',
  },
  grabberWrap: {
    paddingTop: 10,
    alignItems: 'center',
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: radius.pill,
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
    fontWeight: type.weight.bold,
    letterSpacing: -0.4,
    color: color.ink,
  },
  sub: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate500,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingTop: 4,
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  thumb: {
    width: 52,
    height: 70,
    borderRadius: radius.sm,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: type.weight.bold,
    lineHeight: 14.5 * 1.3,
    letterSpacing: -0.2,
    color: color.ink,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowSource: {
    flexShrink: 1,
    fontSize: type.size.label,
    color: color.slate400,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  previewScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  previewCard: {
    alignSelf: 'stretch',
    backgroundColor: color.white,
    borderRadius: radius['2xl'],
    padding: 14,
    gap: 10,
  },
  previewMedia: {
    height: 280,
    borderRadius: radius.lg,
    backgroundColor: color.ink900,
    overflow: 'hidden',
  },
  previewCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTags: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationPill: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: color.inkA55,
  },
  durationText: {
    color: color.white,
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
  },
  previewHook: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    lineHeight: type.size.body * 1.3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewText: {
    gap: 4,
    paddingHorizontal: 2,
  },
  previewTitle: {
    fontSize: type.size.card,
    fontWeight: type.weight.bold,
    letterSpacing: -0.3,
    color: color.ink,
  },
  previewSource: {
    fontSize: type.size.chip,
    color: color.slate400,
  },
  previewWhy: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate500,
  },
});
