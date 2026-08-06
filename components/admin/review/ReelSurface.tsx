import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { color, radiusAdmin, type } from '../../../theme/tokens';
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

function formatTime(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Admin handoff §3 — the post as it will appear on the platform. Player
 * surface with a 3px scrubber at bottom:148 and `0:13 / 0:52`.
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

      <View style={styles.scrubRow} pointerEvents="none">
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.time}>
          {`${formatTime(positionSec)} / ${formatTime(durationSec)}`}
        </Text>
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
    ...StyleSheet.absoluteFillObject,
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
  scrubRow: {
    position: 'absolute',
    bottom: 148,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA28,
    overflow: 'hidden',
  },
  trackFill: {
    height: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
  },
  time: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.whiteA75,
  },
});
