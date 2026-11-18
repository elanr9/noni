// Android (and any build without the native module): expo-video plays cell 0
// of the block under the playhead at its speed; splits show one cell and
// image blocks run on the JS clock. A clip whose local file is gone plays
// from its upload. Preview only; the server render is exact.
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { StyleSheet } from 'react-native';

import {
  assetById,
  blockAt,
  blockRanges,
  documentDurationMs,
  type VideoDocument,
} from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { resolveLocalUri } from '../../../../lib/studio-uploads';
import { supabase } from '../../../../lib/supabase';
import { useJsClock } from './useJsClock';

const signedVideos = new Map<string, Promise<string>>();

function signVideo(path: string): Promise<string> {
  const hit = signedVideos.get(path);
  if (hit) return hit;
  const pending = supabase.storage
    .from('videos')
    .createSignedUrl(path, 3600)
    .then(({ data, error }) => {
      if (error || !data) throw error ?? new Error('could not sign');
      return data.signedUrl;
    });
  pending.catch(() => signedVideos.delete(path));
  signedVideos.set(path, pending);
  return pending;
}

/** Local file when it is still there, else a signed URL for the upload. */
function usePlayableUri(localUri: string | null, storagePath: string | null): string | null {
  const local = useMemo(() => resolveLocalUri(localUri), [localUri]);
  const remotePath = local ? null : storagePath;
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!remotePath) return;
    let alive = true;
    signVideo(remotePath)
      .then((url) => {
        if (alive) setSigned({ path: remotePath, url });
      })
      // No signed URL means no preview frame; the clip itself is untouched.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [remotePath]);
  return local ?? (remotePath && signed?.path === remotePath ? signed.url : null);
}

export function FallbackStagePlayer(props: { doc: VideoDocument }): JSX.Element | null {
  const { doc } = props;
  const totalMs = documentDurationMs(doc);
  const ranges = useMemo(() => blockRanges(doc), [doc]);
  const blockId = useStudioStore((s) => blockAt(doc, s.playheadMs)?.block.id ?? null);
  const playing = useStudioStore((s) => s.playing);

  const range = ranges.find((r) => r.block.id === blockId) ?? null;
  const cell = range?.block.cells[0] ?? null;
  const asset = cell ? assetById(doc, cell.assetId) : null;
  const uri = usePlayableUri(asset?.kind === 'video' ? asset.localUri : null, asset?.kind === 'video' ? asset.storagePath : null);
  const startMs = range?.startMs ?? 0;
  const endMs = range?.endMs ?? 0;
  const inMs = cell?.inMs ?? 0;
  const speed = cell?.speed ?? 1;
  const muted = cell?.muted ?? true;

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.033;
    p.loop = false;
  });
  useJsClock(uri === null, totalMs);

  const lastEmitted = useRef(-1);

  useEffect(() => {
    if (!uri) return;
    let alive = true;
    void player
      .replaceAsync({ uri })
      .then(() => {
        if (!alive) return;
        player.muted = muted;
        player.playbackRate = speed;
        const offset = useStudioStore.getState().playheadMs - startMs;
        player.currentTime = (inMs + Math.max(0, offset) * speed) / 1000;
        if (useStudioStore.getState().playing) player.play();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [player, uri, startMs, inMs, speed, muted]);

  useEffect(() => {
    if (!uri) return;
    if (playing) player.play();
    else player.pause();
  }, [player, playing, uri]);

  useEffect(() => {
    if (!uri) return;
    const advance = (ms: number) => {
      const { setPlayhead, setPlaying } = useStudioStore.getState();
      if (ms >= totalMs) {
        lastEmitted.current = totalMs;
        setPlayhead(totalMs);
        setPlaying(false);
        return;
      }
      lastEmitted.current = Math.round(ms);
      setPlayhead(ms);
    };
    const time = player.addListener('timeUpdate', (e) => {
      const ms = startMs + (e.currentTime * 1000 - inMs) / speed;
      advance(ms >= endMs ? endMs : ms);
    });
    const end = player.addListener('playToEnd', () => advance(endMs));
    return () => {
      time.remove();
      end.remove();
    };
  }, [player, uri, startMs, endMs, inMs, speed, totalMs]);

  useEffect(() => {
    if (!uri) return;
    return useStudioStore.subscribe((state, prev) => {
      const ms = state.playheadMs;
      if (ms === prev.playheadMs || ms === lastEmitted.current) return;
      if (ms < startMs || ms >= endMs) return;
      player.currentTime = (inMs + (ms - startMs) * speed) / 1000;
    });
  }, [player, uri, startMs, endMs, inMs, speed]);

  if (!uri) return null;

  return <VideoView player={player} nativeControls={false} contentFit="cover" style={StyleSheet.absoluteFill} />;
}
