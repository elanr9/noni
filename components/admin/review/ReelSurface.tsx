import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface ReelClip {
  /** "Hook" / "Clip 3" / "Outro". */
  label: string;
  durationSec: number;
}

export interface ReelSurfaceProps {
  /** Signed playback URL. Quiet ink ground with a play glyph when missing. */
  videoUri: string | null;
  playing: boolean;
  onTogglePlay: () => void;
  positionSec: number;
  durationSec: number;
  onPositionSec: (sec: number) => void;
  /** The clips the edit was stitched from, in order. Drives the segmented
   * track and the clip chip so the cut structure reads while it plays. */
  clips?: ReelClip[];
  /** Safe area offset for the clip chip. */
  chipTop?: number;
}

function currentClipIndex(clips: ReelClip[], positionSec: number): number {
  let elapsed = 0;
  for (let i = 0; i < clips.length; i += 1) {
    elapsed += clips[i]?.durationSec ?? 0;
    if (positionSec < elapsed) return i;
  }
  return Math.max(clips.length - 1, 0);
}

/**
 * The post as it plays in the feed: full bleed player with a progress track
 * pinned to the bottom edge, split into one segment per stitched clip.
 */
export function ReelSurface({
  videoUri,
  playing,
  onTogglePlay,
  positionSec,
  durationSec,
  onPositionSec,
  clips = [],
  chipTop = 0,
}: ReelSurfaceProps) {
  const progress = durationSec > 0 ? Math.min(positionSec / durationSec, 1) : 0;
  const segmented = clips.length > 1;
  const clipIndex = segmented ? currentClipIndex(clips, positionSec) : 0;
  const clipTotal = clips.reduce((sum, c) => sum + c.durationSec, 0);
  const seekTo = (index: number) => {
    const start = clips.slice(0, index).reduce((sum, c) => sum + c.durationSec, 0);
    player.currentTime = start;
    onPositionSec(start);
  };

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (videoUri === null) return;
    if (playing) player.play();
    else player.pause();
  }, [playing, player, videoUri]);

  useEffect(() => {
    if (videoUri === null) return;
    const id = setInterval(() => {
      onPositionSec(player.currentTime);
    }, 250);
    return () => clearInterval(id);
  }, [videoUri, player, onPositionSec]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      onPress={onTogglePlay}
      style={styles.fill}
    >
      {videoUri !== null ? (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={styles.centre} pointerEvents="none">
          <Icon name="play" size={30} color={color.blue300} />
        </View>
      )}

      {videoUri !== null && !playing && (
        <View style={styles.centre} pointerEvents="none">
          <View style={styles.playCircle}>
            <Icon name="play" size={22} color={color.white} />
          </View>
        </View>
      )}

      {videoUri !== null && segmented && (
        <View style={[styles.chipRow, { top: chipTop + 12 }]} pointerEvents="none">
          <View style={styles.chip}>
            <Icon name="scissors" size={12} color={color.white} />
            <Text style={styles.chipText}>
              {`${clips[clipIndex]?.label ?? ''} \u00b7 ${clipIndex + 1} of ${clips.length}`}
            </Text>
          </View>
        </View>
      )}

      {segmented ? (
        <View style={styles.segmentRow}>
          {clips.map((clip, i) => {
            const start = clips.slice(0, i).reduce((sum, c) => sum + c.durationSec, 0);
            const fill =
              clip.durationSec > 0
                ? Math.min(Math.max((positionSec - start) / clip.durationSec, 0), 1)
                : 0;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`Jump to ${clip.label}`}
                hitSlop={{ top: 14, bottom: 6 }}
                onPress={() => seekTo(i)}
                style={[
                  styles.segment,
                  { flex: clipTotal > 0 ? Math.max(clip.durationSec / clipTotal, 0.02) : 1 },
                ]}
              >
                <View style={[styles.trackFill, { width: `${fill * 100}%` }]} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  centre: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  trackFill: {
    height: 2.5,
    backgroundColor: color.white,
  },
  segmentRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 3,
  },
  segment: {
    height: 2.5,
    backgroundColor: color.whiteA28,
    overflow: 'hidden',
  },
  chipRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.inkA55,
  },
  chipText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.white,
  },
});
