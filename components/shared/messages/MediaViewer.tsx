import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMedia } from '../../../lib/chat-thread';
import { color, motion, radius, text } from '../../../theme/v2';
import { Icon, Press } from '../../v2';

/** Full-screen ground behind media; the scrim at full strength. */
const BACKDROP = 'rgba(17,17,20,0.96)';
const SOFT = 'rgba(255,255,255,0.18)';
const TRACK = 'rgba(255,255,255,0.3)';

export interface MediaViewerProps {
  /** Null hides the viewer. */
  media: ChatMedia | null;
  /** Signed URL; null while it resolves. */
  url: string | null;
  onClose: () => void;
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Full-screen chat media: pinch, pan and double tap to zoom a photo; video
 * and voice notes play with play/pause and a scrubber. Opens with a fade
 * and a scale from 0.94; drag down or tap close to dismiss.
 */
export function MediaViewer({ media, url, onClose }: MediaViewerProps) {
  const [shown, setShown] = useState<ChatMedia | null>(media);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  if (media && media !== shown) setShown(media);

  useEffect(() => {
    const timing = { duration: motion.push, easing: motion.sheetEase };
    if (media) {
      dragY.set(0);
      progress.set(withTiming(1, timing));
    } else {
      progress.set(withTiming(0, timing, (done) => {
        if (done) runOnJS(setShown)(null);
      }));
    }
  }, [media, progress, dragY]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.get() * (1 - Math.min(Math.abs(dragY.get()) / 400, 0.6)) }));
  const stage = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: dragY.get() }, { scale: 0.94 + 0.06 * progress.get() }],
  }));

  if (!shown) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar style="light" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP }, backdrop]} />
        <Animated.View style={[{ flex: 1 }, stage]}>
          {shown.kind === 'image' ? (
            <ZoomImage url={url} dragY={dragY} onDismiss={onClose} />
          ) : url ? (
            <Player url={url} voice={shown.kind === 'voice'} len={shown.len} dragY={dragY} onDismiss={onClose} />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator color={color.white} />
            </View>
          )}
        </Animated.View>
        <CloseButton onPress={onClose} />
      </GestureHandlerRootView>
    </Modal>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onPress} style={[styles.close, { top: insets.top + 8 }]}>
      <Icon name="close" size={24} color={color.white} />
    </Press>
  );
}

type DragProps = { dragY: ReturnType<typeof useSharedValue<number>>; onDismiss: () => void };

/** Drag down to dismiss; springs back under 120px. */
function useDismissPan({ dragY, onDismiss }: DragProps, enabled: () => boolean) {
  return Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      if (!enabled()) return;
      dragY.set(e.translationY);
    })
    .onEnd((e) => {
      if (enabled() && (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 900)) runOnJS(onDismiss)();
      else dragY.set(withTiming(0, { duration: motion.push, easing: motion.ease }));
    });
}

function ZoomImage({ url, dragY, onDismiss }: { url: string | null } & DragProps) {
  const { width, height } = useWindowDimensions();
  const [loaded, setLoaded] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const spring = { duration: motion.push, easing: motion.ease };

  const clampPan = (s: number) => {
    'worklet';
    const maxX = ((s - 1) * width) / 2;
    const maxY = ((s - 1) * height) / 2;
    tx.set(withTiming(Math.min(maxX, Math.max(-maxX, tx.get())), spring));
    ty.set(withTiming(Math.min(maxY, Math.max(-maxY, ty.get())), spring));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.min(5, Math.max(0.8, savedScale.get() * e.scale)));
    })
    .onEnd(() => {
      const s = Math.max(1, scale.get());
      scale.set(withTiming(s, spring));
      savedScale.set(s);
      clampPan(s);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      savedX.set(tx.get());
      savedY.set(ty.get());
    })
    .onUpdate((e) => {
      if (savedScale.get() <= 1) return;
      tx.set(savedX.get() + e.translationX);
      ty.set(savedY.get() + e.translationY);
    })
    .onEnd(() => {
      if (savedScale.get() > 1) clampPan(savedScale.get());
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = savedScale.get() > 1 ? 1 : 2.5;
      scale.set(withTiming(next, spring));
      savedScale.set(next);
      if (next === 1) {
        tx.set(withTiming(0, spring));
        ty.set(withTiming(0, spring));
      }
    });

  const dismiss = useDismissPan({ dragY, onDismiss }, () => {
    'worklet';
    return savedScale.get() <= 1;
  });

  // Pan only moves a zoomed photo; the dismiss drag only runs at 1x, so all four can listen at once.
  const gesture = Gesture.Simultaneous(pinch, pan, dismiss, doubleTap);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.center} collapsable={false}>
        {url ? (
          <Animated.View style={[{ width, height }, style]}>
            <Image source={{ uri: url }} resizeMode="contain" onLoad={() => setLoaded(true)} style={{ width, height }} accessibilityIgnoresInvertColors />
          </Animated.View>
        ) : null}
        {!loaded ? <ActivityIndicator color={color.white} style={StyleSheet.absoluteFill} /> : null}
      </View>
    </GestureDetector>
  );
}

function Player({ url, voice, len, dragY, onDismiss }: { url: string; voice: boolean; len: string | null } & DragProps) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [trackW, setTrackW] = useState(1);
  const [ended, setEnded] = useState(false);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setTime(currentTime);
    if (player.duration > 0) setDuration(player.duration);
  });
  useEventListener(player, 'playToEnd', () => setEnded(true));

  const toggle = () => {
    if (isPlaying) {
      player.pause();
      return;
    }
    if (ended) {
      player.replay();
      setEnded(false);
      return;
    }
    player.play();
  };

  const shownTime = scrub !== null ? scrub * duration : time;
  const frac = duration > 0 ? Math.min(1, shownTime / duration) : 0;

  const seekAt = (x: number) => Math.min(1, Math.max(0, x / trackW));
  const scrubGesture = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => setScrub(seekAt(e.x)))
    .onUpdate((e) => setScrub(seekAt(e.x)))
    .onFinalize((e) => {
      const f = seekAt(e.x);
      if (duration > 0) player.seekBy(f * duration - player.currentTime);
      setEnded(false);
      setScrub(null);
    });
  const tapGesture = Gesture.Tap().runOnJS(true).onEnd(() => toggle());
  const dismiss = useDismissPan({ dragY, onDismiss }, () => {
    'worklet';
    return true;
  });

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={Gesture.Exclusive(dismiss, tapGesture)}>
        <View style={styles.center} collapsable={false}>
          {voice ? (
            <View style={styles.voiceDisc}>
              <Icon name="graphic_eq" size={56} color={color.white} />
            </View>
          ) : (
            <VideoView player={player} nativeControls={false} contentFit="contain" style={StyleSheet.absoluteFill} />
          )}
          {status === 'loading' ? <ActivityIndicator color={color.white} style={StyleSheet.absoluteFill} /> : null}
          {status === 'error' ? <Text style={[text.body, styles.error]}>This file could not play.</Text> : null}
        </View>
      </GestureDetector>
      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        <Press accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'} onPress={toggle} style={styles.playBtn}>
          <Icon name={isPlaying ? 'pause' : ended ? 'replay' : 'play_arrow'} size={30} color={color.ink} />
        </Press>
        <GestureDetector gesture={scrubGesture}>
          <View style={styles.trackHit} onLayout={(e) => setTrackW(Math.max(1, e.nativeEvent.layout.width))} accessibilityRole="adjustable" accessibilityLabel="Seek">
            <View style={[styles.track, scrub !== null && { height: 6 }]}>
              <View style={[styles.fill, { width: `${frac * 100}%` }]} />
            </View>
            <View style={[styles.knob, { left: frac * trackW - 7, opacity: scrub !== null ? 1 : 0.9 }]} />
          </View>
        </GestureDetector>
        <Text style={styles.time}>
          {clock(shownTime)} / {duration > 0 ? clock(duration) : len ?? '0:00'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: radius.pill, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  voiceDisc: { width: 140, height: 140, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' },
  error: { color: color.white, position: 'absolute', bottom: 40 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12 },
  playBtn: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  trackHit: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: 3, borderRadius: radius.pill, backgroundColor: TRACK, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.white },
  knob: { position: 'absolute', width: 14, height: 14, borderRadius: radius.pill, backgroundColor: color.white },
  time: { minWidth: 84, textAlign: 'right', fontSize: 15, fontWeight: '700', color: color.white, fontVariant: ['tabular-nums'] },
});
