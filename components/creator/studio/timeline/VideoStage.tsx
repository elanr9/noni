// The 9:16 preview frame: player underneath (native composition on iOS,
// expo-video on Android), image cells over it, then the caller's overlay
// layer. Tap toggles playback. Drives playheadMs and playing in the store.
import { forwardRef, useImperativeHandle, useState, type JSX, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { documentDurationMs, type VideoDocument } from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { isVideoEditorAvailable } from '../../../../modules/video-editor';
import { color } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { FrameFit } from '../../slides/FrameFit';
import { FallbackStagePlayer } from './FallbackStagePlayer';
import { ImageCells } from './ImageCells';
import { NativeStagePlayer } from './NativeStagePlayer';
import { clamp } from './geometry';

export type VideoStageHandle = { seekTo(ms: number): void };

export type VideoStageProps = { doc: VideoDocument; children?: ReactNode };

const useNative = Platform.OS === 'ios' && isVideoEditorAvailable();

export const VideoStage = forwardRef<VideoStageHandle, VideoStageProps>(function VideoStage(
  props,
  ref,
): JSX.Element {
  const { doc, children } = props;
  const playing = useStudioStore((s) => s.playing);
  const setPlaying = useStudioStore((s) => s.setPlaying);
  const setPlayhead = useStudioStore((s) => s.setPlayhead);
  const totalMs = documentDurationMs(doc);
  const [card, setCard] = useState<{ w: number; h: number } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(ms: number) {
        setPlayhead(clamp(ms, 0, totalMs));
      },
    }),
    [setPlayhead, totalMs],
  );

  const togglePlay = () => {
    if (totalMs === 0) return;
    if (!playing && useStudioStore.getState().playheadMs >= totalMs) setPlayhead(0);
    setPlaying(!playing);
  };

  return (
    <FrameFit style={styles.area} frameStyle={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause preview' : 'Play preview'}
        onPress={togglePlay}
        onLayout={(e) => setCard({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={StyleSheet.absoluteFill}
      >
        {useNative ? <NativeStagePlayer doc={doc} /> : <FallbackStagePlayer doc={doc} />}
        {card ? <ImageCells doc={doc} stageWidth={card.w} stageHeight={card.h} /> : null}
        {children ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {children}
          </View>
        ) : null}
        {!playing && totalMs > 0 ? (
          <View style={styles.playWrap} pointerEvents="none">
            <View style={styles.play}>
              <Icon name="play" size={26} color={color.white} />
            </View>
          </View>
        ) : null}
      </Pressable>
    </FrameFit>
  );
});

const styles = StyleSheet.create({
  area: { flex: 1, marginHorizontal: 16, marginBottom: 4 },
  card: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' },
  playWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
});
