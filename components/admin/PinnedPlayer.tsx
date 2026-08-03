import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

export interface PinnedPlayerProps {
  /** Player height below the status-bar inset (330 default, 250 thread variant). */
  heightPx: number;
  playing: boolean;
  onTogglePlay: () => void;
  positionSec: number;
  durationSec: number;
  onBack: () => void;
  /** "1 of 5". */
  counterLabel: string;
  /** Thread variant: replaces the counter chip (screenshot 08), amber-soft/amber. */
  takeChip?: string;
  /** Thread variant: bottom-left caption; replaces the scrub row (screenshot 08). */
  captionOverlay?: string;
  /** Signed playback URL. When set, real video renders under the chrome. */
  videoUri?: string | null;
  onPositionSec?: (sec: number) => void;
}

function formatTime(sec: number): string {
  const whole = Math.floor(sec);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Fixed dark player at the top of Review 1f (README §5.2 / §5.4). */
export function PinnedPlayer({
  heightPx,
  playing,
  onTogglePlay,
  positionSec,
  durationSec,
  onBack,
  counterLabel,
  takeChip,
  captionOverlay,
  videoUri,
  onPositionSec,
}: PinnedPlayerProps) {
  const insets = useSafeAreaInsets();
  const backTop = insets.top + 6;
  const chipTop = insets.top + 10;
  const progress = durationSec > 0 ? Math.min(positionSec / durationSec, 1) : 0;

  const player = useVideoPlayer(videoUri ?? null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!videoUri) return;
    if (playing) player.play();
    else player.pause();
  }, [playing, player, videoUri]);

  useEffect(() => {
    if (!videoUri || !onPositionSec) return;
    const id = setInterval(() => {
      onPositionSec(player.currentTime);
    }, 250);
    return () => clearInterval(id);
  }, [videoUri, player, onPositionSec]);

  return (
    <View style={[styles.player, { height: insets.top + heightPx }]}>
      {videoUri ? (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={{ top: 9, bottom: 9, left: 16, right: 9 }}
        style={[styles.back, { top: backTop }]}
      >
        <Icon name="chevron-left" size={26} color={color.white} />
      </PressableScale>

      {takeChip !== undefined ? (
        <View style={[styles.takeChip, { top: chipTop }]}>
          <Text style={styles.takeChipText}>{takeChip}</Text>
        </View>
      ) : (
        <View style={[styles.counterChip, { top: chipTop }]}>
          <Text style={styles.counterText}>{counterLabel}</Text>
        </View>
      )}

      <View pointerEvents="box-none" style={styles.centre}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={onTogglePlay}
          style={styles.playCircle}
        >
          <Icon name={playing ? 'pause' : 'play'} size={24} color={color.ink} />
        </PressableScale>
      </View>

      {captionOverlay !== undefined ? (
        <Text style={styles.caption}>{captionOverlay}</Text>
      ) : (
        <View style={styles.scrubRow}>
          <Text style={styles.timeCurrent}>{formatTime(positionSec)}</Text>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
            <View style={[styles.knob, { left: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.timeDuration}>{formatTime(durationSec)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    width: '100%',
    backgroundColor: color.ink900,
    overflow: 'hidden',
  },
  back: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
  },
  counterChip: {
    position: 'absolute',
    right: 20,
    zIndex: 2,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  counterText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.white,
  },
  takeChip: {
    position: 'absolute',
    right: 20,
    zIndex: 2,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.amberSoft,
  },
  takeChipText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.amber,
  },
  centre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubRow: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeCurrent: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.whiteA90,
  },
  timeDuration: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.whiteA60,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
  },
  trackFill: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  knob: {
    position: 'absolute',
    top: -3.5,
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  caption: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    zIndex: 2,
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.whiteA75,
  },
});
