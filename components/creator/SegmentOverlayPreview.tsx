// Live preview of a segment's final edit while the creator records. Mirrors
// the render pass in supabase/functions/_shared/renderAdapter.ts: every
// admin-placed text box (TikTok Sans, per-box color and position) and the
// screenshot card at its admin-placed spot. Green screen segments skip
// the card here because the screenshot fills the stage as the background.
import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  TikTokSans_700Bold,
  useFonts,
} from '@expo-google-fonts/tiktok-sans';

import type { BriefSegment, TextOverlay } from '../../lib/briefs-api';
import {
  overlayBoxFill,
  overlayTextContrast,
  parseOverlayBoxes,
} from '../../lib/overlay-boxes';
import { OutlinedText } from '../ui/OutlinedText';
import { DragPlacement, type PlacementMove } from './DragPlacement';

const IMAGE_Y = 0.62;
const IMAGE_WIDTH = 0.85;

/** `url` is always something Image can draw (a poster frame for recordings);
 * `videoUrl` is the signed recording itself when the media is a video. */
export type ShotPreview = { url: string; aspect: number; videoUrl?: string };

function GreenScreenRecording(props: {
  uri: string;
  recording: boolean;
}): JSX.Element {
  const { uri, recording } = props;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  // Each take starts the recording from its first frame, matching the render,
  // which loops the recording from zero under the creator's clip.
  useEffect(() => {
    if (recording) player.replay();
  }, [player, recording]);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

/** Full-frame background for a green screen clip while the creator records:
 * the screenshot as a still, or the screen recording playing muted. */
export function GreenScreenBackdrop(props: {
  shot: ShotPreview;
  recording: boolean;
}): JSX.Element {
  const { shot, recording } = props;
  if (shot.videoUrl) {
    return <GreenScreenRecording uri={shot.videoUrl} recording={recording} />;
  }
  return (
    <Image
      source={{ uri: shot.url }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  );
}

/** Screen recording inside the card: idle shows the poster; a take plays it
 * once from zero and the card disappears when it ends, mirroring the render. */
function ShotRecording(props: {
  shot: ShotPreview;
  uri: string;
  recording: boolean;
  onEnded: () => void;
}): JSX.Element {
  const { shot, uri, recording, onEnded } = props;
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  useEffect(() => {
    if (recording) player.replay();
    else player.pause();
  }, [player, recording]);
  useEffect(() => {
    if (!recording) return;
    const sub = player.addListener('playToEnd', onEnded);
    return () => sub.remove();
  }, [player, recording, onEnded]);
  if (!recording) {
    return <Image source={{ uri: shot.url }} style={styles.cardImg} />;
  }
  return (
    <VideoView
      player={player}
      style={styles.cardImg}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function ShotCard(props: {
  segment: BriefSegment;
  shot: ShotPreview;
  stageWidth: number;
  stageHeight: number;
  recording: boolean | undefined;
  onMoveCard?: PlacementMove;
  onDragStart?: () => void;
}): JSX.Element | null {
  const { segment, shot, stageWidth, stageHeight, recording } = props;
  const [ended, setEnded] = useState(false);
  // A new take starts with the card visible again.
  const [wasRecording, setWasRecording] = useState(recording === true);
  if (wasRecording !== (recording === true)) {
    setWasRecording(recording === true);
    if (!recording) setEnded(false);
  }

  const cardWidth = stageWidth * (segment.screenshot_width ?? IMAGE_WIDTH);
  const cardHeight = cardWidth / shot.aspect;
  const playsOnce = shot.videoUrl !== undefined && recording !== undefined;
  if (playsOnce && ended) return null;

  return (
    <DragPlacement
      x={segment.screenshot_x ?? 0.5}
      y={segment.screenshot_y ?? IMAGE_Y}
      stageWidth={stageWidth}
      stageHeight={stageHeight}
      onMove={props.onMoveCard}
      onDragStart={props.onDragStart}
      style={[styles.card, { width: cardWidth, height: cardHeight }]}
    >
      {playsOnce && shot.videoUrl !== undefined ? (
        <ShotRecording
          shot={shot}
          uri={shot.videoUrl}
          recording={recording === true}
          onEnded={() => setEnded(true)}
        />
      ) : (
        <Image source={{ uri: shot.url }} style={styles.cardImg} />
      )}
    </DragPlacement>
  );
}

export function SegmentOverlayPreview(props: {
  segment: BriefSegment;
  shot: ShotPreview | null;
  stageWidth: number;
  stageHeight: number;
  overlay: TextOverlay;
  /** Drives a screen recording card: false shows the poster, true plays the
   * recording once from zero, hiding the card when it ends. Undefined keeps
   * the static poster card. */
  recording?: boolean;
  /** When set, the creator can hold and drag each text box. */
  onMoveBox?: (boxId: string, x: number, y: number) => void;
  /** When set, the creator can hold and drag the screenshot card. */
  onMoveCard?: PlacementMove;
  onDragStart?: () => void;
}): JSX.Element | null {
  const {
    segment,
    shot,
    stageWidth,
    stageHeight,
    overlay,
    recording,
    onMoveBox,
    onMoveCard,
    onDragStart,
  } = props;
  const [fontLoaded] = useFonts({ TikTokSans_700Bold });

  const showText = overlay.enabled && segment.show_on_screen;
  const boxes = showText
    ? parseOverlayBoxes(segment.overlay_style, {
        text: segment.overlay_text,
        textY: segment.text_y,
      })
    : [];
  const showCard = shot !== null && segment.layout !== 'green_screen';
  if (boxes.length === 0 && !showCard) return null;

  const interactive = onMoveBox !== undefined || onMoveCard !== undefined;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={interactive ? 'box-none' : 'none'}
    >
      {showCard && shot !== null ? (
        <ShotCard
          segment={segment}
          shot={shot}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          recording={recording}
          onMoveCard={onMoveCard}
          onDragStart={onDragStart}
        />
      ) : null}
      {boxes.map((box) => {
        const font = stageWidth * box.size;
        const text = box.text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('\n');
        if (text.length === 0) return null;
        const base = {
          lineHeight: font * 1.3,
          fontFamily: fontLoaded ? 'TikTokSans_700Bold' : undefined,
        };
        return (
          <DragPlacement
            key={box.id}
            x={box.x}
            y={box.y}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            onMove={
              onMoveBox ? (nx, ny) => onMoveBox(box.id, nx, ny) : undefined
            }
            onDragStart={onDragStart}
            layerStyle={styles.textLayer}
            style={styles.textWrap}
          >
            {box.bg ? (
              <Text
                style={[
                  styles.text,
                  base,
                  {
                    fontSize: font,
                    color: overlayTextContrast(box.color),
                    backgroundColor: overlayBoxFill(box.color),
                    paddingHorizontal: font * 0.72,
                    paddingVertical: font * 0.48,
                    borderRadius: font * 0.72,
                    overflow: 'hidden',
                  },
                ]}
              >
                {text}
              </Text>
            ) : (
              <OutlinedText
                text={text}
                fontSize={font}
                color={box.color}
                style={[styles.text, base]}
              />
            )}
          </DragPlacement>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  textLayer: {
    paddingHorizontal: 36,
  },
  textWrap: {
    maxWidth: '100%',
  },
  text: {
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    maxWidth: '100%',
  },
});
