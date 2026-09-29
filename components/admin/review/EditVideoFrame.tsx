// A muted, paused frame of a clip: the still the manager places text over.
// Seeks once the source is ready (and again on any later reload), and falls
// back to a second source when the first fails to load.
import { useEffect, useState, type JSX } from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export type VideoStill = { uri: string; atSec: number };

export function EditVideoFrame(props: { still: VideoStill; fallback?: VideoStill }): JSX.Element {
  const { still, fallback } = props;
  const [failed, setFailed] = useState(false);
  const active = failed && fallback !== undefined ? fallback : still;

  useEffect(() => {
    setFailed(false);
  }, [still.uri]);

  const player = useVideoPlayer(active.uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.pause();
  });

  useEffect(() => {
    const seek = () => {
      player.currentTime = active.atSec;
      player.pause();
    };
    seek();
    const status = player.addListener('statusChange', ({ status: next }) => {
      if (next === 'readyToPlay') seek();
      if (next === 'error' && !failed && fallback !== undefined) setFailed(true);
    });
    const loaded = player.addListener('sourceLoad', seek);
    return () => {
      status.remove();
      loaded.remove();
    };
  }, [player, active.atSec, failed, fallback]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
}
