// Instagram audio search for the creator's AudioSheet (AUDIO.md). The Audio
// API returns only music licensed for third party use; an empty query means
// trending. { q } -> { tracks: Track[], source: 'instagram' | 'unconfigured' }.
//
// Needs IG_GRAPH_ACCESS_TOKEN (a long lived token for the company's
// professional account) and IG_USER_ID. Without them the function answers
// with no tracks and the app falls back to its local sample library.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';
const FETCH_TIMEOUT_MS = 8000;

type Track = {
  id: string;
  title: string;
  artist: string;
  dur: number;
  uses: number;
  trend: boolean;
  kind: 'music' | 'original';
  tags: string[];
  cover: string | null;
  igAudioId: string;
  previewUrl: string | null;
};

type IgAudio = {
  id?: string;
  title?: string;
  artist?: string;
  duration_in_ms?: number;
  cover_art_url?: string;
  preview_url?: string;
  usage_count?: number;
  is_trending?: boolean;
};

function toTrack(a: IgAudio): Track | null {
  if (!a.id || !a.title) return null;
  return {
    id: `ig:${a.id}`,
    title: a.title,
    artist: a.artist ?? 'Unknown artist',
    dur: Math.max(1, Math.round((a.duration_in_ms ?? 30000) / 1000)),
    uses: a.usage_count ?? 0,
    trend: a.is_trending ?? false,
    kind: a.artist ? 'music' : 'original',
    tags: [],
    cover: a.cover_art_url ?? null,
    igAudioId: a.id,
    previewUrl: a.preview_url ?? null,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const caller = await authenticate(req, adminClient());
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);

  const token = Deno.env.get('IG_GRAPH_ACCESS_TOKEN');
  const igUser = Deno.env.get('IG_USER_ID');
  let q = '';
  try {
    const body = (await req.json()) as { q?: unknown };
    q = typeof body.q === 'string' ? body.q.trim().slice(0, 80) : '';
  } catch {
    q = '';
  }
  if (!token || !igUser) return jsonResponse({ tracks: [], source: 'unconfigured' });

  const url = new URL(`${GRAPH}/${igUser}/audio_search`);
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'id,title,artist,duration_in_ms,cover_art_url,preview_url,usage_count,is_trending');
  url.searchParams.set('access_token', token);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return jsonResponse({ tracks: [], source: 'instagram', error: `graph ${res.status}` }, 200);
    const json = (await res.json()) as { data?: IgAudio[] };
    const tracks = (json.data ?? []).map(toTrack).filter((t): t is Track => t !== null);
    return jsonResponse({ tracks, source: 'instagram' });
  } catch (e) {
    return jsonResponse({ tracks: [], source: 'instagram', error: e instanceof Error ? e.message : 'fetch failed' }, 200);
  }
});
