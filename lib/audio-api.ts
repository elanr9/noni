/**
 * Sound search for the AudioSheet: the Instagram Audio API through the
 * audio-search function. There is no local stand in: when the function is
 * unconfigured or unreachable the sheet says so and offers a retry, it never
 * shows made up tracks. Saved sounds live on the device, whole, so they show
 * up again without a search.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LibraryTrack } from './audio-library';
import { supabase } from './supabase';

export type AudioSource = 'instagram';

/** Why a search came back without tracks. */
export type AudioSearchError = 'unconfigured' | 'unreachable';

export type AudioSearchResult =
  | { ok: true; tracks: LibraryTrack[]; source: AudioSource }
  | { ok: false; error: AudioSearchError };

const SAVED_KEY = 'noni.audio.saved.v2';

/** Remote tracks for a query (empty = trending). */
export async function searchAudio(q: string): Promise<AudioSearchResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{ tracks: LibraryTrack[]; source: string }>('audio-search', { body: { q } });
    if (error || !data) return { ok: false, error: 'unreachable' };
    if (data.source === 'unconfigured') return { ok: false, error: 'unconfigured' };
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    return { ok: true, tracks: tracks.map((t) => ({ ...t, c: coverFor(t.id) })), source: 'instagram' };
  } catch {
    return { ok: false, error: 'unreachable' };
  }
}

/** Remote tracks for a query, or null when sound search is not answering. */
export async function remoteTracks(q: string): Promise<LibraryTrack[] | null> {
  const res = await searchAudio(q);
  return res.ok ? res.tracks : null;
}

function coverFor(id: string): [string, string] {
  const pal: [string, string][] = [['#1BA6EE', '#0A4DA3'], ['#7E3BFF', '#FF2D78'], ['#2BBF7A', '#1BA6EE'], ['#F6A623', '#FE2C55'], ['#1A1A1F', '#7E3BFF']];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}

function isTrack(v: unknown): v is LibraryTrack {
  if (!v || typeof v !== 'object') return false;
  const t = v as Partial<LibraryTrack>;
  return typeof t.id === 'string' && typeof t.title === 'string' && typeof t.artist === 'string' && typeof t.dur === 'number';
}

/** Saved sounds, newest first. */
export async function loadSavedSounds(): Promise<LibraryTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isTrack) : [];
  } catch {
    return [];
  }
}

export function storeSavedSounds(tracks: LibraryTrack[]): void {
  AsyncStorage.setItem(SAVED_KEY, JSON.stringify(tracks)).catch(() => undefined);
}

/** "Golden Hour Drive Noa Vale": what the creator pastes into TikTok's sound search. */
export function tiktokSearchText(t: { title: string; artist: string }): string {
  return `${t.title} ${t.artist}`.trim();
}
