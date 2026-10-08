// iOS preview: the native composition plays the document 1:1 (image cells
// hold their time with empty ranges), so native time is store time. The
// store playhead is the single source of truth; a change that did not come
// from the player is a seek request (scrub, overlay tap, seekTo).
import { useEffect, useMemo, useRef, type JSX } from 'react';
import { StyleSheet } from 'react-native';

import { documentDurationMs, type VideoDocument } from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import {
  VideoEditorPreview,
  hasNativeVideo,
  toNativeBlockTimeline,
  type PreviewErrorEvent,
  type PreviewTimeEvent,
  type VideoEditorPreviewHandle,
} from '../../../../modules/video-editor';
import { useJsClock, useThrottledValue } from './useJsClock';

const REBUILD_THROTTLE_MS = 80;
/** Scrub seeks are imprecise; a frame accurate seek follows once the hand rests. */
const PRECISE_SEEK_DELAY_MS = 140;

export function NativeStagePlayer(props: { doc: VideoDocument }): JSX.Element | null {
  const { doc } = props;
  const viewRef = useRef<VideoEditorPreviewHandle>(null);
  const playing = useStudioStore((s) => s.playing);
  const setPlayhead = useStudioStore((s) => s.setPlayhead);
  const setPlaying = useStudioStore((s) => s.setPlaying);

  const timeline = useMemo(() => toNativeBlockTimeline(doc), [doc]);
  const shown = useThrottledValue(timeline, REBUILD_THROTTLE_MS);
  const hasVideo = hasNativeVideo(shown);
  useJsClock(!hasVideo, documentDurationMs(doc));

  const lastEmitted = useRef(-1);
  const preciseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasVideo) return;
    const unsubscribe = useStudioStore.subscribe((state, prev) => {
      const ms = state.playheadMs;
      if (ms === prev.playheadMs || ms === lastEmitted.current) return;
      void viewRef.current?.seekTo(ms, false).catch(() => undefined);
      if (preciseTimer.current) clearTimeout(preciseTimer.current);
      preciseTimer.current = setTimeout(() => {
        preciseTimer.current = null;
        void viewRef.current?.seekTo(ms, true).catch(() => undefined);
      }, PRECISE_SEEK_DELAY_MS);
    });
    return () => {
      unsubscribe();
      if (preciseTimer.current) clearTimeout(preciseTimer.current);
    };
  }, [hasVideo]);

  if (!VideoEditorPreview || !hasVideo) return null;

  const onTime = (e: PreviewTimeEvent) => {
    const ms = Math.max(0, Math.round(e.nativeEvent.positionMs));
    lastEmitted.current = ms;
    setPlayhead(ms);
  };
  const onError = (e: PreviewErrorEvent) => console.warn('studio preview', e.nativeEvent.message);

  return (
    <VideoEditorPreview
      ref={viewRef}
      timeline={shown}
      playing={playing}
      onTime={onTime}
      onEnd={() => setPlaying(false)}
      onError={onError}
      style={StyleSheet.absoluteFill}
    />
  );
}
