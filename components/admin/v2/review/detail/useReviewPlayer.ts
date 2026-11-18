import { useCallback, useEffect, useState } from 'react';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';

export type ReviewPlayer = {
  player: VideoPlayer;
  playing: boolean;
  /** Seconds into the post. */
  time: number;
  /** Seconds; the submission's stored length until the file reports its own. */
  duration: number;
  fast: boolean;
  setPlaying: (on: boolean) => void;
  toggle: () => void;
  seek: (sec: number) => void;
  setFast: (on: boolean) => void;
};

/** One expo-video player for the review band: play state, clock, seek and the hold for 2x rate. */
export function useReviewPlayer(uri: string | null, storedDuration: number): ReviewPlayer {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [reported, setReported] = useState(0);
  const [fast, setFast] = useState(false);
  const duration = reported > 0 ? reported : storedDuration;

  useEffect(() => {
    setTime(0);
    setReported(0);
  }, [uri]);

  useEffect(() => {
    if (uri === null) return;
    if (playing) player.play();
    else player.pause();
  }, [playing, player, uri]);

  useEffect(() => {
    if (uri === null) return;
    player.playbackRate = fast ? 2 : 1;
  }, [fast, player, uri]);

  useEffect(() => {
    if (uri === null || !playing) return;
    const id = setInterval(() => {
      const now = player.currentTime;
      const total = player.duration;
      if (total > 0) setReported(total);
      setTime(now);
      if (total > 0 && now >= total - 0.08) {
        setPlaying(false);
        setFast(false);
      }
    }, 100);
    return () => clearInterval(id);
  }, [uri, playing, player]);

  const seek = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, duration > 0 ? Math.min(sec, duration) : sec);
      if (uri !== null) player.currentTime = clamped;
      setTime(clamped);
    },
    [duration, player, uri],
  );

  const toggle = useCallback(() => {
    if (!playing && duration > 0 && time >= duration - 0.1) seek(0);
    setPlaying(!playing);
  }, [playing, duration, time, seek]);

  return { player, playing, time, duration, fast, setPlaying, toggle, seek, setFast };
}
