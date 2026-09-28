// Mirror of the server's subtitle chunking (supabase/functions/_shared/cues.ts
// subtitleLines) so the stage placeholder shows the line the render will
// burn in at the playhead. Change both together.
import type { TranscriptWord } from '../../../lib/video-edit';

/** Centre of the two line block sits this far from its top and bottom (renderTimeline SUBTITLE_HALF_HEIGHT). */
export const SUBTITLE_HALF_HEIGHT = 0.05;
export const SUBTITLE_FONT_VMIN = 6.2;
export const SUBTITLE_WIDTH = 0.8;
export const SUBTITLE_LINES = 2;
export const SUBTITLE_PLACEHOLDER = 'Your subtitles\nshow up here';

const SUBTITLE_MAX_CHARS = 40;
const SUBTITLE_PAUSE_BREAK_MS = 600;

export type SubtitleChunk = { text: string; startMs: number; endMs: number };

function endsSentence(word: string): boolean {
  return /[.?!]["')\]]*$/.test(word);
}

export function subtitleChunks(words: TranscriptWord[]): SubtitleChunk[] {
  const chunks: SubtitleChunk[] = [];
  let group: TranscriptWord[] = [];
  let chars = 0;
  const flush = () => {
    const first = group[0];
    const last = group[group.length - 1];
    if (first && last) {
      chunks.push({ text: group.map((w) => w.w).join(' '), startMs: first.s, endMs: last.e });
    }
    group = [];
    chars = 0;
  };
  for (const word of words) {
    const previous = group[group.length - 1];
    if (previous) {
      const tooLong = chars + 1 + word.w.length > SUBTITLE_MAX_CHARS;
      const longPause = word.s - previous.e > SUBTITLE_PAUSE_BREAK_MS;
      if (tooLong || longPause) flush();
    }
    group.push(word);
    chars += (group.length > 1 ? 1 : 0) + word.w.length;
    if (endsSentence(word.w)) flush();
  }
  flush();
  return chunks;
}

/** The chunk spoken at `sourceMs`, or null between chunks. */
export function subtitleTextAt(chunks: SubtitleChunk[], sourceMs: number): string | null {
  const hit = chunks.find((c) => sourceMs >= c.startMs && sourceMs <= c.endMs);
  return hit ? hit.text : null;
}

export function subtitleBand(y: number): { top: number; bottom: number } {
  return { top: y - SUBTITLE_HALF_HEIGHT, bottom: y + SUBTITLE_HALF_HEIGHT };
}
