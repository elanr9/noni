// Inline replay of the clip just recorded: looping full-bleed video, tap to
// pause, and a scrub bar the creator can drag.
import { useCallback, useRef, type JSX } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';

import { color, radius } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export type ClipPlayback = {
  player: VideoPlayer;
  playing: boolean;
  /** 0..1 */
  progress: number;
  toggle: () => void;
  seekTo: (fraction: number) => void;
  pause: () => void;
  resume: () => void;
};

export function useClipPlayback(uri: string, fallbackDurationMs: number): ClipPlayback {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.05;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const durationS = player.duration > 0 ? player.duration : fallbackDurationMs / 1000;
  const progress = durationS > 0 ? Math.min(1, Math.max(0, currentTime / durationS)) : 0;

  const toggle = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);
  const seekTo = useCallback(
    (fraction: number) => {
      const d = player.duration > 0 ? player.duration : fallbackDurationMs / 1000;
      player.seekBy(Math.min(1, Math.max(0, fraction)) * d - player.currentTime);
    },
    [player, fallbackDurationMs],
  );
  const pause = useCallback(() => player.pause(), [player]);
  const resume = useCallback(() => player.play(), [player]);

  return { player, playing: isPlaying, progress, toggle, seekTo, pause, resume };
}

/** Full-bleed looping video with a tap target that pauses and resumes. */
export function ClipVideo(props: { playback: ClipPlayback }): JSX.Element {
  const { playback } = props;
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={playback.player}
        contentFit="cover"
        nativeControls={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playback.playing ? 'Pause clip' : 'Play clip'}
        onPress={playback.toggle}
        style={StyleSheet.absoluteFill}
      />
      {!playback.playing ? (
        <View style={styles.playWrap} pointerEvents="none">
          <View style={styles.play}>
            <Icon name="play" size={26} color={color.ink} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Drag anywhere on the bar to seek; playback pauses while the finger is down. */
export function ScrubBar(props: { playback: ClipPlayback }): JSX.Element {
  const { playback } = props;
  const widthRef = useRef(0);
  const wasPlayingRef = useRef(false);

  const seekAt = (evt: GestureResponderEvent) => {
    if (widthRef.current <= 0) return;
    playback.seekTo(evt.nativeEvent.locationX / widthRef.current);
  };
  const settle = () => {
    if (wasPlayingRef.current) playback.resume();
  };

  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(evt) => {
        wasPlayingRef.current = playback.playing;
        playback.pause();
        seekAt(evt);
      }}
      onResponderMove={seekAt}
      onResponderRelease={settle}
      onResponderTerminate={settle}
      accessibilityRole="adjustable"
      accessibilityLabel="Scrub clip"
      style={styles.scrubHit}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
      }}
    >
      <View style={styles.scrubTrack} pointerEvents="none">
        <View style={[styles.scrubFill, { width: `${playback.progress * 100}%` }]} />
      </View>
      <View
        style={[styles.scrubKnob, { left: `${playback.progress * 100}%` }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  playWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  scrubHit: {
    height: 28,
    justifyContent: 'center',
  },
  scrubTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
    overflow: 'hidden',
  },
  scrubFill: {
    height: '100%',
    backgroundColor: color.white,
  },
  scrubKnob: {
    position: 'absolute',
    top: 7,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
});
