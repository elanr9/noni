import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { BriefSegment, TextOverlay } from '../../../lib/briefs-api';
import { OVERLAY_TEXT_SPEC } from '../../../lib/overlay-boxes';
import { color, radiusAdmin, space, type } from '../../../theme/tokens';
import {
  GreenScreenBackdrop,
  SegmentOverlayPreview,
  type ShotPreview,
} from '../../creator/SegmentOverlayPreview';
import { ReviewMetaOverlay } from '../review/ReviewMetaOverlay';
import { Icon } from '../../ui/Icon';
import { OutlinedText } from '../../ui/OutlinedText';
import { PressableScale } from '../../ui/PressableScale';

export type PreviewClipSpec = {
  key: string;
  label: string;
  segment: BriefSegment;
  shot: ShotPreview | null;
  spokenText: string | null;
};

export type TikTokPreviewProps = {
  visible: boolean;
  onClose: () => void;
  initialIndex?: number;
  clips: PreviewClipSpec[];
  creatorName: string;
  handle: string | null;
  typeLabel: string | null;
  caption: string;
  hashtags: string[];
  subtitles: boolean;
  subtitlesY: number;
  overlay: TextOverlay;
  format: 'video' | 'photo_carousel';
};

const STAGE_ASPECT = 9 / 16;
const SWIPE_DX = 40;
const CHROME_HEIGHT = 190;
const LARGE_SCREEN_WIDTH = 600;
const NO_CLIPS: PreviewClipSpec[] = [];

/** Image cannot draw an mp4, so video shots get a poster frame, and every
 * shot takes its real aspect, the way the record screen resolves them. */
function useResolvedShots(clips: PreviewClipSpec[]): Record<string, ShotPreview> {
  const [resolved, setResolved] = useState<Record<string, ShotPreview>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      clips.map(async (clip) => {
        const shot = clip.shot;
        if (shot === null) return null;
        let url = shot.url;
        if (shot.videoUrl) {
          try {
            url = (await VideoThumbnails.getThumbnailAsync(shot.videoUrl, { time: 0 })).uri;
          } catch {
            // keep the signed URL; the card just stays blank
          }
        }
        const aspect = await new Promise<number>((resolve) => {
          Image.getSize(
            url,
            (w, h) => resolve(h > 0 ? w / h : shot.aspect),
            () => resolve(shot.aspect),
          );
        });
        return [clip.key, { ...shot, url, aspect }] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResolved(
        Object.fromEntries(
          entries.filter((e): e is readonly [string, ShotPreview] => e !== null),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [clips]);
  return resolved;
}

function CreatorPlaceholder(): JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="noniPreviewBackdrop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2A3440" stopOpacity="1" />
            <Stop offset="1" stopColor={color.ink900} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniPreviewBackdrop)" />
      </Svg>
      <View style={styles.placeholderCenter}>
        <Icon name="circle-user-round" size={72} color={color.whiteA16} />
        <Text style={styles.placeholderLabel}>Creator on camera</Text>
      </View>
    </View>
  );
}

function TopTabBar(props: { top: number }): JSX.Element {
  return (
    <View style={[styles.tabBar, { top: props.top }]} pointerEvents="none">
      <View style={styles.tabs}>
        <Text style={styles.tabDim}>Following</Text>
        <View style={styles.tabActiveWrap}>
          <Text style={styles.tabActive}>For You</Text>
          <View style={styles.tabUnderline} />
        </View>
      </View>
      <View style={styles.tabSearch}>
        <Icon name="search" size={22} color={color.white} />
      </View>
    </View>
  );
}

function SubtitlePlaceholder(props: {
  stageWidth: number;
  stageHeight: number;
  y: number;
}): JSX.Element {
  const { stageWidth, stageHeight, y } = props;
  const fontSize = (Math.min(stageWidth, stageHeight) / 100) * 6.2;
  const lineHeight = fontSize * OVERLAY_TEXT_SPEC.condensed.lineHeight;
  const width = stageWidth * 0.8;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.subtitleWrap,
        { width, left: (stageWidth - width) / 2, top: y * stageHeight },
      ]}
    >
      <OutlinedText
        text={'Your subtitles\nshow up here'}
        fontSize={fontSize}
        color={color.white}
        style={[styles.subtitleText, { lineHeight }]}
      />
    </View>
  );
}

function ClipChips(props: {
  clips: PreviewClipSpec[];
  index: number;
  onPick: (index: number) => void;
}): JSX.Element {
  const { clips, index, onPick } = props;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      style={styles.chipScroll}
    >
      {clips.map((clip, i) => {
        const active = i === index;
        return (
          <PressableScale
            key={clip.key}
            accessibilityRole="button"
            accessibilityLabel={`Show clip ${clip.label}`}
            onPress={() => onPick(i)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {clip.label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

export function TikTokPreview(props: TikTokPreviewProps): JSX.Element {
  const {
    visible,
    onClose,
    initialIndex = 0,
    clips,
    creatorName,
    handle,
    typeLabel,
    caption,
    hashtags,
    subtitles,
    subtitlesY,
    overlay,
    format,
  } = props;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  // Reopening starts on the requested clip, before the first frame paints.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setIndex(initialIndex);
  }
  const safeIndex = clips.length === 0 ? 0 : Math.min(index, clips.length - 1);
  const shots = useResolvedShots(visible ? clips : NO_CLIPS);

  const availableWidth = window.width - insets.left - insets.right - space[4] * 2;
  const availableHeight = window.height - insets.top - insets.bottom - CHROME_HEIGHT;
  const stageHeight = Math.min(availableHeight, availableWidth / STAGE_ASPECT);
  const stageWidth = stageHeight * STAGE_ASPECT;
  const rounded = window.width >= LARGE_SCREEN_WIDTH;

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gs) =>
          Math.abs(gs.dx) > SWIPE_DX && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
        onPanResponderRelease: (_e, gs) => {
          setIndex((prev) => {
            const i = Math.min(prev, Math.max(clips.length - 1, 0));
            if (gs.dx < 0 && i < clips.length - 1) return i + 1;
            if (gs.dx > 0 && i > 0) return i - 1;
            return i;
          });
        },
      }),
    [clips.length],
  );

  const clip = clips[safeIndex] ?? null;
  const shot = clip !== null ? (shots[clip.key] ?? clip.shot) : null;
  const greenScreen =
    clip !== null && clip.segment.layout === 'green_screen' && shot !== null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar style="light" />
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top, paddingBottom: insets.bottom + space[3] },
        ]}
      >
        <View style={styles.topRow}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            onPress={onClose}
            style={styles.closeButton}
          >
            <Icon name="x" size={20} color={color.white} />
          </PressableScale>
          <ClipChips clips={clips} index={safeIndex} onPick={setIndex} />
          <View style={styles.closeSpacer} />
        </View>

        <View style={styles.stageWrap}>
          <View
            {...swipe.panHandlers}
            style={[
              styles.stage,
              { width: stageWidth, height: stageHeight },
              rounded && styles.stageRounded,
            ]}
          >
            {greenScreen && shot !== null ? (
              <GreenScreenBackdrop shot={shot} recording={false} />
            ) : (
              <CreatorPlaceholder />
            )}
            {clip !== null ? (
              <SegmentOverlayPreview
                segment={clip.segment}
                shot={shot}
                stageWidth={stageWidth}
                stageHeight={stageHeight}
                overlay={overlay}
              />
            ) : null}
            {subtitles && format === 'video' ? (
              <SubtitlePlaceholder
                stageWidth={stageWidth}
                stageHeight={stageHeight}
                y={subtitlesY}
              />
            ) : null}
            <TopTabBar top={stageHeight * 0.03} />
            <ReviewMetaOverlay
              creatorName={creatorName}
              handle={handle}
              typeLabel={typeLabel}
              ageLabel="now"
              format={format}
              caption={caption}
              hashtags={hashtags}
            />
          </View>
        </View>

        <View style={styles.footer}>
          {clip?.spokenText ? (
            <Text numberOfLines={2} style={styles.spoken}>
              Creator says: {clip.spokenText}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={styles.hint}>
            Text and media are shown at the exact size and place they will render.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: space[2],
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeSpacer: {
    width: 36,
  },
  chipScroll: {
    flex: 1,
  },
  chipRow: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[2],
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
  },
  chipActive: {
    backgroundColor: color.white,
  },
  chipText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  chipTextActive: {
    color: color.ink900,
  },
  stageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    backgroundColor: color.ink900,
    overflow: 'hidden',
  },
  stageRounded: {
    borderRadius: 24,
  },
  placeholderCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  placeholderLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.whiteA45,
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  tabDim: {
    fontSize: 17,
    fontWeight: type.weight.semibold,
    color: color.whiteA75,
  },
  tabActiveWrap: {
    alignItems: 'center',
    gap: 4,
  },
  tabActive: {
    fontSize: 17,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  tabUnderline: {
    width: 28,
    height: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
  },
  tabSearch: {
    position: 'absolute',
    right: 14,
  },
  subtitleWrap: {
    position: 'absolute',
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitleText: {
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    gap: space[2],
    alignItems: 'center',
    minHeight: 64,
  },
  spoken: {
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.whiteA75,
    textAlign: 'center',
  },
  hint: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.whiteA45,
    textAlign: 'center',
  },
});
