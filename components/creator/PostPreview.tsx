// Full screen "how it lands in the feed" preview the creator opens before
// sending for approval. Composes the same surfaces the admin review screen
// uses so both sides see an identical post.
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { TikTokSans_700Bold, useFonts } from '@expo-google-fonts/tiktok-sans';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BriefSegment } from '../../lib/briefs-api';
import { OVERLAY_TEXT_SPEC, parseOverlayBoxes, type OverlayBox } from '../../lib/overlay-boxes';
import { color, radiusAdmin, type } from '../../theme/tokens';
import { ReviewMetaOverlay } from '../admin/review/ReviewMetaOverlay';
import { SlideshowSurface, type SlideshowSurfaceSlide } from '../admin/review/SlideshowSurface';
import { Icon } from '../ui/Icon';
import { OverlayTextBox } from '../ui/OverlayTextBox';
import { PressableScale } from '../ui/PressableScale';

export type PreviewClip = { uri: string; boxes: OverlayBox[]; durationMs: number };

export type PostPreviewMedia =
  | { kind: 'slides'; slides: SlideshowSurfaceSlide[] }
  | { kind: 'video'; clips: PreviewClip[] };

export type PostPreviewProps = {
  visible: boolean;
  onClose: () => void;
  creatorName: string;
  handle: string | null;
  typeLabel: string | null;
  caption: string;
  hashtags: string[];
  media: PostPreviewMedia;
};

type Size = { width: number; height: number };

const SWIPE_DX = 40;

/** Recorded clips in slot order with the boxes that will be burned onto each. */
export function videoPreviewClips(params: {
  plan: { slotIndex: number; segment: BriefSegment | null }[];
  clips: Record<number, { localUri: string | null; durationMs: number }>;
}): PreviewClip[] {
  const out: PreviewClip[] = [];
  for (const { slotIndex, segment } of params.plan) {
    const clip = params.clips[slotIndex];
    if (clip === undefined || clip.localUri === null) continue;
    const boxes =
      segment !== null && segment.show_on_screen
        ? parseOverlayBoxes(segment.overlay_style, {
            text: segment.overlay_text,
            textY: segment.text_y,
          })
        : [];
    out.push({ uri: clip.localUri, boxes, durationMs: clip.durationMs });
  }
  return out;
}

function ClipBoxes(props: { boxes: OverlayBox[]; stage: Size }): JSX.Element {
  const { boxes, stage } = props;
  const [fontLoaded] = useFonts({ TikTokSans_700Bold });
  return (
    <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
      {boxes.map((box) => {
        const text = box.text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('\n');
        if (text.length === 0) return null;
        return (
          <View key={box.id} style={[StyleSheet.absoluteFill, styles.centre]}>
            <View
              style={{
                transform: [
                  { translateX: (box.x - 0.5) * stage.width },
                  { translateY: (box.y - 0.5) * stage.height },
                ],
              }}
            >
              <OverlayTextBox
                text={text}
                color={box.color}
                bg={box.bg}
                fontSize={box.size * stage.width}
                maxWidth={OVERLAY_TEXT_SPEC.maxWidth * stage.width}
                fontLoaded={fontLoaded}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** One player walks the clips back to back and loops the whole sequence. */
function ClipSequencePlayer(props: { clips: PreviewClip[]; stage: Size }): JSX.Element {
  const { clips, stage } = props;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const indexRef = useRef(0);

  const player = useVideoPlayer(clips[0]?.uri ?? null, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      const next = (indexRef.current + 1) % clips.length;
      indexRef.current = next;
      setIndex(next);
      const uri = clips[next]?.uri;
      if (uri === undefined) return;
      void player.replaceAsync(uri).then(() => player.play());
    });
    return () => sub.remove();
  }, [player, clips]);

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  useEffect(() => {
    const id = setInterval(() => setPositionMs(player.currentTime * 1000), 250);
    return () => clearInterval(id);
  }, [player]);

  const totalMs = clips.reduce((sum, c) => sum + c.durationMs, 0);
  const elapsedMs =
    clips.slice(0, index).reduce((sum, c) => sum + c.durationMs, 0) + positionMs;
  const progress = totalMs > 0 ? Math.min(elapsedMs / totalMs, 1) : 0;
  const current = clips[index];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      onPress={() => setPlaying((v) => !v)}
      style={styles.fill}
    >
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      {current !== undefined && stage.width > 0 ? (
        <ClipBoxes boxes={current.boxes} stage={stage} />
      ) : null}
      {!playing && (
        <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
          <View style={styles.playCircle}>
            <Icon name="play" size={22} color={color.white} />
          </View>
        </View>
      )}
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

export function PostPreview(props: PostPreviewProps): JSX.Element {
  const { visible, onClose, creatorName, handle, typeLabel, caption, hashtags, media } = props;
  const insets = useSafeAreaInsets();
  const [slideIndex, setSlideIndex] = useState(0);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const slideCount = media.kind === 'slides' ? media.slides.length : 0;

  // Move only captures on a clear horizontal drag so the arrows still tap.
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gs) =>
          Math.abs(gs.dx) > SWIPE_DX && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
        onPanResponderRelease: (_e, gs) => {
          setSlideIndex((i) => {
            if (gs.dx < 0 && i < slideCount - 1) return i + 1;
            if (gs.dx > 0 && i > 0) return i - 1;
            return i;
          });
        },
      }),
    [slideCount],
  );

  function onStageLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setStage({ width, height });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onShow={() => setSlideIndex(0)}
    >
      <StatusBar style="light" />
      <View style={styles.screen}>
        <View style={styles.media} onLayout={onStageLayout}>
          {media.kind === 'slides' ? (
            <View style={styles.fill} {...swipe.panHandlers}>
              <SlideshowSurface
                slides={media.slides}
                index={slideIndex}
                onIndex={setSlideIndex}
              />
            </View>
          ) : (
            <ClipSequencePlayer clips={media.clips} stage={stage} />
          )}

          <ReviewMetaOverlay
            creatorName={creatorName}
            handle={handle}
            typeLabel={typeLabel}
            ageLabel="now"
            format={media.kind === 'video' ? 'video' : 'photo_carousel'}
            caption={caption}
            hashtags={hashtags}
            slideCount={slideCount}
            slideIndex={slideIndex}
          />

          <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              onPress={onClose}
              style={styles.glassButton}
            >
              <Icon name="x" size={20} color={color.white} />
            </PressableScale>
            <View style={styles.previewPill}>
              <Text style={styles.previewText}>Preview</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink900 },
  media: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1, backgroundColor: color.ink900 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2.5,
    backgroundColor: color.whiteA28,
  },
  trackFill: { height: 2.5, backgroundColor: color.white },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  glassButton: {
    width: 36,
    height: 36,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPill: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
  },
  previewText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.white,
  },
});
