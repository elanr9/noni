import type { AudioTrack } from './brief-library';
import { fmt } from './v2-format';

/**
 * Sound helpers for the AudioSheet. Tracks only ever come from the real
 * audio-search function (lib/audio-api.ts); there is no built in sample
 * library, so nothing here is shown as a real song.
 */
export type LibraryTrack = AudioTrack & { uses: number; trend: boolean; kind: 'music' | 'original'; tags: string[]; c: [string, string] };

/**
 * @deprecated Left empty on purpose: the app never shows made up tracks.
 * Kept only so app/dev-preview/c-sound.tsx still compiles.
 */
export const AUDIO_LIB: LibraryTrack[] = [];

export function trackLength(dur: number): string {
  return `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`;
}

/** "1.2M reels", or null when the platform did not say. */
export function trackUses(n: number): string | null {
  return n > 0 ? `${fmt(n)} reels` : null;
}

/** Cover gradient for a track: its own colours when it has them, else a hash of the id. */
export function coverColors(t: Pick<AudioTrack, 'id'> & { c?: [string, string] }): [string, string] {
  if (t.c) return t.c;
  const pal: [string, string][] = [['#1BA6EE', '#0A4DA3'], ['#7E3BFF', '#FF2D78'], ['#2BBF7A', '#1BA6EE'], ['#F6A623', '#FE2C55']];
  let h = 0;
  for (const ch of t.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}

export function trackKind(t: Pick<AudioTrack, 'id'> & { kind?: 'music' | 'original' }): 'music' | 'original' {
  return t.kind ?? 'music';
}

/** Deterministic waveform heights (0.25 to 1) for a track id. */
export function trackBars(id: string, n: number): number[] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + (((h >>> 16) % 1000) / 1000) * 0.75 * (0.6 + 0.4 * Math.sin(i / 3));
  });
}
