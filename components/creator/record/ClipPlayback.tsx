// Inline replay of the clip just recorded: looping full-bleed video, tap to
// pause with an animated glyph, and a scrub bar that follows the finger 1:1.
// The player is owned by the screen so the file preloads before this mounts.
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { VideoView, type VideoPlayer } from 'expo-video';

import { color, radius } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export type ClipPlayback = {
  player: VideoPlayer;
  playing: boolean;
  /** 0..1 playhead, updated off React on every timeUpdate. */
  position: Animated.Value;
  toggle: () => void;
  seekTo: (fraction: number) => void;
  pause: () => void;
  /** Finger down on the bar: hold playback and let the finger own the position. */
  beginScrub: () => void;
  /** Finger up: resume if it was playing before. */
  endScrub: () => void;
};

export function useClipPlayback(player: VideoPlayer, fallbackDurationMs: number): ClipPlayback {
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [position] = useState(() => new Animated.Value(0));
  const scrubbingRef = useRef(false);

  const durationS = useCallback(
    () => (player.duration > 0 ? player.duration : fallbackDurationMs / 1000),
    [player, fallbackDurationMs],
  );

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (scrubbingRef.current) return;
    const d = durationS();
    position.setValue(d > 0 ? Math.min(1, Math.max(0, currentTime / d)) : 0);
  });

  const toggle = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);
  const seekTo = useCallback(
    (fraction: number) => {
      const f = Math.min(1, Math.max(0, fraction));
      position.setValue(f);
      player.seekBy(f * durationS() - player.currentTime);
    },
    [player, position, durationS],
  );
  const pause = useCallback(() => player.pause(), [player]);
  const wasPlayingRef = useRef(false);
  const beginScrub = useCallback(() => {
    scrubbingRef.current = true;
    wasPlayingRef.current = player.playing;
    player.pause();
  }, [player]);
  const endScrub = useCallback(() => {
    scrubbingRef.current = false;
    if (wasPlayingRef.current) player.play();
  }, [player]);

  return { player, playing: isPlaying, position, toggle, seekTo, pause, beginScrub, endScrub };
}

/** Full-bleed looping video with a tap target that pauses and resumes. */
export function ClipVideo(props: { playback: ClipPlayback }): JSX.Element {
  const { playback } = props;
  const [glyph] = useState(() => new Animated.Value(playback.playing ? 0 : 1));

  useEffect(() => {
    Animated.spring(glyph, {
      toValue: playback.playing ? 0 : 1,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [playback.playing, glyph]);

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
      <Animated.View
        style={[
          styles.playWrap,
          {
            opacity: glyph,
            transform: [
              { scale: glyph.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.play}>
          <Icon name="play" size={26} color={color.ink} />
        </View>
      </Animated.View>
    </View>
  );
}

/** Drag anywhere on the bar to seek; the knob follows the finger directly. */
export function ScrubBar(props: { playback: ClipPlayback }): JSX.Element {
  const { playback } = props;
  const [width, setWidth] = useState(0);

  const seekAt = (evt: GestureResponderEvent) => {
    if (width <= 0) return;
    playback.seekTo(evt.nativeEvent.locationX / width);
  };

  const knobX = Animated.multiply(playback.position, width);

  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(evt) => {
        playback.beginScrub();
        seekAt(evt);
      }}
      onResponderMove={seekAt}
      onResponderRelease={playback.endScrub}
      onResponderTerminate={playback.endScrub}
      accessibilityRole="adjustable"
      accessibilityLabel="Scrub clip"
      style={styles.scrubHit}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.scrubTrack} pointerEvents="none">
        {width > 0 ? (
          <Animated.View
            style={[
              styles.scrubFill,
              {
                width,
                transform: [
                  {
                    translateX: Animated.multiply(
                      Animated.subtract(playback.position, 1),
                      width / 2,
                    ),
                  },
                  { scaleX: playback.position },
                ],
              },
            ]}
          />
        ) : null}
      </View>
      <Animated.View
        style={[styles.scrubKnob, { transform: [{ translateX: knobX }] }]}
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
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: color.white,
  },
  scrubKnob: {
    position: 'absolute',
    top: 7,
    left: -7,
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
});
