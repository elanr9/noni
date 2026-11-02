/**
 * The v2 Briefs library model (BRIEFS.md section 6). A Brief is anything the
 * campaign manager saves for creators: a Guided template (clips, sound,
 * notes) or an Outline (title and notes). Posts match a brief by title until
 * the creator flows write `briefId`.
 */

export type BriefKind = 'Guided' | 'Outline';
export type BriefType = 'Talking Head' | 'Long Text' | 'Slideshow' | 'Greenscreen';
export const BRIEF_TYPES: readonly BriefType[] = ['Talking Head', 'Long Text', 'Slideshow', 'Greenscreen'];

export type AudioMode = 'none' | 'pick' | 'creator' | null;
export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  dur: number;
  cover?: string | null;
  /** Instagram audio id when the track came from the Audio API; attached at Reel publish. */
  igAudioId?: string | null;
  /** A file the editor can play and mix; null when only the platform can attach it. */
  url?: string | null;
  previewUrl?: string | null;
};
/** A sound on a post: the track, where it starts in seconds and the mix (0 to 100). */
export type PostAudio = { track: AudioTrack; start: number; vol: number; voice: number };
export type BriefAudio = { mode: AudioMode; track: AudioTrack | null };

/** Green screen media behind the creator. `dur` in seconds for video, 0 for an image. */
export type GsMedia = { src: string; label?: string; kind: 'image' | 'video'; dur: number };

export type StTextStyle = 'none' | 'outline' | 'inv-outline' | 'bg' | 'inv-bg';
/** On-screen text positioned in percent of the 9:16 frame; size in px at a 300 wide frame. */
export type StText = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  size: number;
  font: number;
  color: string;
  align: 'left' | 'center' | 'right';
  style: StTextStyle;
  spans: { start: number; end: number; color?: string; style?: StTextStyle }[];
};
export type StOverlay = { id: string; src: string; label: string; x: number; y: number; w: number };
export type ClipDoc = { texts: StText[]; overlays: StOverlay[] };

export type BriefClip = {
  id: string;
  /** Teleprompter: what the creator says. */
  text: string;
  onScreen: string;
  cta: boolean;
  green: boolean;
  gs: GsMedia | null;
  doc: ClipDoc | null;
};

export type GuidedState = {
  title: string;
  link: string;
  linkNotes: string;
  phrase: string;
  notes: string;
  fullGreen: boolean;
  gs: GsMedia | null;
  caption: string;
  tags: string[];
  clips: BriefClip[];
  audio: BriefAudio;
  filled?: boolean;
};

export type LongTextState = { title: string; onScreen: string; notes: string; doc: ClipDoc | null };

export type Brief = {
  id: string;
  type: BriefType;
  kind: BriefKind;
  title: string;
  notes: string;
  link: string;
  /** Display name of who saved it. */
  by: string;
  /** Saved at, ms. */
  ts: number;
  audio: BriefAudio | null;
  clips: BriefClip[] | null;
  g: GuidedState | null;
  lt: LongTextState | null;
  /** The guided brief this outline twin was saved with. */
  from: string | null;
  caption: string;
  tags: string[];
  /** Posts made from it, when the backend counts them. */
  uses?: number;
};

export const TYPE_META: Record<BriefType, { icon: 'record_voice_over' | 'subject' | 'photo_library' | 'wallpaper'; tone: 'blue' | 'purple' | 'pink' | 'green' }> = {
  'Talking Head': { icon: 'record_voice_over', tone: 'blue' },
  'Long Text': { icon: 'subject', tone: 'purple' },
  Slideshow: { icon: 'photo_library', tone: 'pink' },
  Greenscreen: { icon: 'wallpaper', tone: 'green' },
};

let seq = 0;
export function uid(): string {
  seq += 1;
  return `${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function newClip(text = '', o: Partial<BriefClip> = {}): BriefClip {
  return { id: uid(), text, cta: false, green: true, gs: null, onScreen: '', doc: null, ...o };
}

export function emptyGuided(): GuidedState {
  return { title: '', link: '', linkNotes: '', phrase: '', notes: '', fullGreen: true, gs: null, caption: '', tags: [], clips: [newClip('')], audio: { mode: null, track: null } };
}

export function emptyLongText(): LongTextState {
  return { title: '', onScreen: '', notes: '', doc: null };
}

/** Default on-screen text: TikTok classic, centred, 60% wide, 17% from the top. */
export function stText(text: string, o: Partial<StText> = {}): StText {
  return { id: uid(), text, x: 46, y: 17, w: 60, size: 26, font: 0, color: '#FFFFFF', align: 'center', style: 'outline', spans: [], ...o };
}

/** On-screen label from a spoken line: first clause, at most six words, no trailing punctuation. */
export function shortLabel(t: string): string {
  if (!t) return '';
  const first = t.split(/[.!?]/)[0].split(/,|:| but | and /i)[0].trim();
  return first.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?]+$/, '');
}

/** The texts drawn on a clip tile: its doc, else one default text from onScreen or the script. */
export function clipTexts(c: BriefClip): StText[] {
  if (c.doc && c.doc.texts.length) return c.doc.texts;
  const label = c.onScreen || shortLabel(c.text);
  return label ? [stText(label, { id: `${c.id}-t` })] : [];
}

export function clipOverlays(c: BriefClip): StOverlay[] {
  return c.doc ? c.doc.overlays : [];
}

/** Estimated seconds a clip runs: words / 2.6, at least 2; slideshows 3, long text 7. */
export function clipSeconds(c: BriefClip, type: BriefType): number {
  if (type === 'Long Text') return 7;
  if (type === 'Slideshow') return 3;
  const n = c.text.trim() ? c.text.trim().split(/\s+/).length : 0;
  return Math.max(2, Math.round(n / 2.6));
}

/** "Hook", "Clip 1", "Slide 2", "The clip". */
export function clipLabel(i: number, type: BriefType): string {
  if (type === 'Long Text') return 'The clip';
  if (type === 'Slideshow') return `Slide ${i + 1}`;
  return i === 0 ? 'Hook' : `Clip ${i}`;
}

/** "Template", "Long Text" or "Outline": the word the viewer uses for a brief. */
export function briefWord(b: Pick<Brief, 'kind' | 'type'>): string {
  if (b.kind === 'Outline') return 'Outline';
  return b.type === 'Long Text' ? 'Long Text' : 'Template';
}

export const outlineTwinId = (id: string) => `${id}-o`;

/** Haystack for search: title, notes, type and author. */
export function briefHay(b: Brief): string {
  return `${b.title} ${b.notes} ${b.type} ${b.by}`.toLowerCase();
}
