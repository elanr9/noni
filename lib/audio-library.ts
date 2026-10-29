import type { AudioTrack } from './brief-library';
import { fmt } from './v2-format';

/**
 * Sample sound library until the Instagram Audio API search is wired (AUDIO.md).
 * Data and scoring match reference/V2Audio.jsx.txt.
 */
export type LibraryTrack = AudioTrack & { uses: number; trend: boolean; kind: 'music' | 'original'; tags: string[]; c: [string, string] };

export const AUDIO_LIB: LibraryTrack[] = [
  { id: 's1', title: 'Golden Hour Drive', artist: 'Noa Vale', dur: 31, uses: 1240000, trend: true, kind: 'music', tags: ['chill', 'summer', 'upbeat', 'vlog'], c: ['#F6A623', '#FE2C55'] },
  { id: 's2', title: 'Kickoff', artist: 'Marlow & Dee', dur: 27, uses: 886000, trend: true, kind: 'music', tags: ['hype', 'sport', 'gym', 'soccer', 'energy'], c: ['#1BA6EE', '#0A4DA3'] },
  { id: 's3', title: 'Slow Motion Sundays', artist: 'Ivy Reyes', dur: 42, uses: 402000, trend: false, kind: 'music', tags: ['calm', 'piano', 'emotional', 'cinematic'], c: ['#7E3BFF', '#FF2D78'] },
  { id: 's4', title: 'Original audio', artist: '@coachdanny', dur: 19, uses: 312000, trend: true, kind: 'original', tags: ['voice', 'coach', 'soccer', 'funny'], c: ['#2BBF7A', '#1BA6EE'] },
  { id: 's5', title: 'Run It Back', artist: 'Tenn Sixx', dur: 24, uses: 2100000, trend: true, kind: 'music', tags: ['hype', 'drill', 'sport', 'bass'], c: ['#0B0B0C', '#444444'] },
  { id: 's6', title: 'Nightlight', artist: 'Clara Moon', dur: 36, uses: 97000, trend: false, kind: 'music', tags: ['dreamy', 'lofi', 'night', 'chill'], c: ['#FF8A00', '#FFD60A'] },
  { id: 's7', title: 'Original audio', artist: '@fieldvision', dur: 15, uses: 54000, trend: false, kind: 'original', tags: ['brand', 'voice', 'tutorial'], c: ['#1BA6EE', '#2BBF7A'] },
  { id: 's8', title: 'Cold Open', artist: 'Bastion', dur: 29, uses: 640000, trend: true, kind: 'music', tags: ['cinematic', 'suspense', 'reveal', 'dramatic'], c: ['#1A1A1F', '#7E3BFF'] },
  { id: 's9', title: 'Tiny Wins', artist: 'Hollow Pine', dur: 33, uses: 188000, trend: false, kind: 'music', tags: ['acoustic', 'happy', 'warm', 'tutorial'], c: ['#2BBF7A', '#FFD60A'] },
  { id: 's10', title: 'Original audio', artist: '@maya.pitch', dur: 22, uses: 21000, trend: false, kind: 'original', tags: ['voice', 'storytime', 'soccer'], c: ['#FE2C55', '#FF8A00'] },
];

/** Quick moods under the empty search field. */
export const AU_SUGGEST = ['hype', 'chill', 'soccer', 'cinematic', 'voice', 'tutorial'];

/** Score title, artist and tags per word: exact 4, starts with 3, word starts with 2, contains 1; trending adds 0.5. Null when the query is empty. */
export function searchTracks(q: string): LibraryTrack[] | null {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const score = (t: LibraryTrack) => {
    const hay = [t.title, t.artist, ...t.tags].map((x) => x.toLowerCase());
    let s = 0;
    for (const w of words) {
      let best = 0;
      for (const h of hay) {
        if (h === w) best = Math.max(best, 4);
        else if (h.startsWith(w)) best = Math.max(best, 3);
        else if (h.split(/\s+/).some((p) => p.startsWith(w))) best = Math.max(best, 2);
        else if (h.includes(w)) best = Math.max(best, 1);
      }
      if (!best) return 0;
      s += best;
    }
    return s + (t.trend ? 0.5 : 0);
  };
  return AUDIO_LIB.map((t) => [t, score(t)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
}

export function trackLength(dur: number): string {
  return `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`;
}

export function trackUses(n: number): string {
  return `${fmt(n)} reels`;
}

/** Cover gradient for a saved track: the library colours, else a hash of the id. */
export function coverColors(t: Pick<AudioTrack, 'id'>): [string, string] {
  const lib = AUDIO_LIB.find((x) => x.id === t.id);
  if (lib) return lib.c;
  const pal: [string, string][] = [['#1BA6EE', '#0A4DA3'], ['#7E3BFF', '#FF2D78'], ['#2BBF7A', '#1BA6EE'], ['#F6A623', '#FE2C55']];
  let h = 0;
  for (const ch of t.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}

export function trackKind(t: Pick<AudioTrack, 'id'>): 'music' | 'original' {
  return AUDIO_LIB.find((x) => x.id === t.id)?.kind ?? 'music';
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
