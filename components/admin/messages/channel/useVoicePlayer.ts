import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { signedChatUrl, type ManagerMessage } from '../../../../lib/manager-messages-api';

export function useVoicePlayer() {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const stop = useCallback(() => {
    playerRef.current?.pause();
    playerRef.current?.remove();
    playerRef.current = null;
    setPlayingId(null);
  }, []);

  const toggle = useCallback(
    async (message: ManagerMessage) => {
      if (!message.mediaPath) return;
      if (playingId === message.id) {
        stop();
        return;
      }
      try {
        playerRef.current?.remove();
        const uri = await signedChatUrl(message.mediaPath);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const player = createAudioPlayer({ uri });
        playerRef.current = player;
        setPlayingId(message.id);
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            setPlayingId(null);
            player.remove();
            playerRef.current = null;
          }
        });
        player.play();
      } catch (e) {
        setPlayingId(null);
        Alert.alert('Could not play', e instanceof Error ? e.message : 'Try again');
      }
    },
    [playingId, stop],
  );

  return { playingId, toggle, stop };
}
