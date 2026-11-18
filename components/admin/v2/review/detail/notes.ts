import type { PostNote } from '../../../../../lib/post-event-labels';

/** One manager note on a post. `at` is seconds into a reel or a slide index; null covers the whole post. */
export type ReviewNote = { id: string; at: number | null; text: string };

/** "0:12", "1:05". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pinned notes by time, whole post notes first. */
export function sortNotes(notes: ReviewNote[]): ReviewNote[] {
  return [...notes].sort((a, b) => (a.at ?? -1) - (b.at ?? -1));
}

/** Pill text: "0:12" or "Slide 3" for pinned notes, "Whole" otherwise. */
export function noteLabel(at: number | null, isReel: boolean): string {
  if (at === null) return 'Whole';
  return isReel ? clock(at) : `Slide ${at + 1}`;
}

/** The structured send back rows the creator app reads: label then text. */
export function toPostNotes(notes: ReviewNote[], isReel: boolean): PostNote[] {
  return sortNotes(notes).map((n) => ({
    label: n.at === null ? (isReel ? 'Whole video' : 'Whole post') : isReel ? clock(n.at) : `Slide ${n.at + 1}`,
    text: n.text.trim(),
  }));
}

/** Flat text for legacy readers: "0:12: text" blocks separated by a blank line. */
export function toFlatNote(notes: PostNote[]): string {
  return notes.map((n) => `${n.label}: ${n.text}`).join('\n\n');
}

/** Read back sent notes: "0:12" and "Slide 3" become pinned, anything else covers the whole post. */
export function fromPostNotes(notes: PostNote[], isReel: boolean): ReviewNote[] {
  return sortNotes(
    notes.map((n, i) => {
      const time = /^(\d+):(\d{2})$/.exec(n.label.trim());
      const slide = /^Slide (\d+)$/i.exec(n.label.trim());
      const at = isReel && time ? Number(time[1]) * 60 + Number(time[2]) : !isReel && slide ? Number(slide[1]) - 1 : null;
      return { id: `sent-${i}`, at, text: n.text };
    }),
  );
}

/** "Save changes", "Save 1 change", "Save 3 changes". */
export function saveLabel(count: number): string {
  if (count === 0) return 'Save changes';
  return `Save ${count} ${count === 1 ? 'change' : 'changes'}`;
}
