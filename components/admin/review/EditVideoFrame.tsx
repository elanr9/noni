// A muted, paused frame of a clip: the still the manager places text over.
import { useEffect, type JSX } from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export function EditVideoFrame(props: { uri: string; atSec: number }): JSX.Element {
  const { uri, atSec } = props;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    const seek = () => {
      player.currentTime = atSec;
      player.pause();
    };
    seek();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') seek();
    });
    return () => sub.remove();
  }, [player, atSec]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
}
