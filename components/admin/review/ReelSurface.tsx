import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface ReelSurfaceProps {
  /** Signed playback URL. Quiet ink ground with a play glyph when missing. */
  videoUri: string | null;
  playing: boolean;
  onTogglePlay: () => void;
  positionSec: number;
  durationSec: number;
  onPositionSec: (sec: number) => void;
}

/**
 * The post as it plays in the feed: full bleed player with a hairline
 * progress bar pinned to the bottom edge.
 */
export function ReelSurface({
  videoUri,
  playing,
  onTogglePlay,
  positionSec,
  durationSec,
  onPositionSec,
}: ReelSurfaceProps) {
  const progress = durationSec > 0 ? Math.min(positionSec / durationSec, 1) : 0;

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

      <View style={styles.track} pointerEvents="none">
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
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
});
