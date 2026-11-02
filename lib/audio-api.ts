/**
 * Sound search for the AudioSheet: the Instagram Audio API through the
 * audio-search function, scored and sectioned the same way as the local
 * sample library, which stands in whenever the function is unconfigured or
 * unreachable. Saved sounds live on the device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUDIO_LIB, searchTracks, type LibraryTrack } from './audio-library';
import { supabase } from './supabase';

export type AudioSource = 'instagram' | 'local';

const SAVED_KEY = 'noni.audio.saved';

/** Remote tracks for a query (empty = trending), or null when the API is not answering. */
export async function remoteTracks(q: string): Promise<LibraryTrack[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ tracks: LibraryTrack[]; source: string }>('audio-search', { body: { q } });
    if (error || !data || data.source === 'unconfigured') return null;
    return data.tracks.map((t) => ({ ...t, c: coverFor(t.id) }));
  } catch {
    return null;
  }
}

/** Search: Instagram when it answers, else the local library scored by title, artist and tags. */
export async function searchAudio(q: string): Promise<{ tracks: LibraryTrack[]; source: AudioSource }> {
  const remote = await remoteTracks(q);
  if (remote) return { tracks: remote, source: 'instagram' };
  return { tracks: q.trim() ? (searchTracks(q) ?? []) : AUDIO_LIB, source: 'local' };
}

function coverFor(id: string): [string, string] {
  const pal: [string, string][] = [['#1BA6EE', '#0A4DA3'], ['#7E3BFF', '#FF2D78'], ['#2BBF7A', '#1BA6EE'], ['#F6A623', '#FE2C55'], ['#1A1A1F', '#7E3BFF']];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}

export async function loadSavedSounds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : ['s2']);
  } catch {
    return new Set(['s2']);
  }
}

export function storeSavedSounds(ids: Set<string>): void {
  AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...ids])).catch(() => undefined);
}

/** "Golden Hour Drive Noa Vale": what the creator pastes into TikTok's sound search. */
export function tiktokSearchText(t: { title: string; artist: string }): string {
  return `${t.title} ${t.artist}`.trim();
}
