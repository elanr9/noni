// Local drafts for the creator make flow, keyed by assignment id. The plan
// (slides or clips, text, order) and the local file URIs survive leaving the
// screen with no network; the server side drafts (creator_projects,
// recording_drafts) carry what has uploaded.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import type { PickedPhoto } from '../../../lib/submissions';
import type { CreatorSlide } from './model';
import type { ReelPlanItem } from './reel/plan';

export type SlideshowDraft = {
  /** The brief the slides were built from; a swap makes the draft stale. */
  briefId?: string;
  /** briefSignature of that brief after the variant; a manager edit makes it stale. */
  sig?: string;
  slides: CreatorSlide[];
  caption: string;
  tags: string;
  search: string;
};

// Picked photos live in the image picker cache, which iOS purges. Each pick
// is copied into the documents directory so a draft can come back days later.
const PICKS_DIR = 'noni-picks';

function picksDir(): Directory {
  const dir = new Directory(Paths.document, PICKS_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function isPickCopy(uri: string): boolean {
  return uri.includes(`/${PICKS_DIR}/`);
}

/** The pick copied into documents/noni-picks; the original when the copy fails. */
export async function persistPick(photo: PickedPhoto): Promise<PickedPhoto> {
  if (isPickCopy(photo.uri)) return photo;
  try {
    const src = new File(photo.uri);
    const ext = /\.([a-z0-9]{2,5})$/i.exec(src.name)?.[1] ?? 'jpg';
    const dest = new File(picksDir(), `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`);
    await src.copy(dest);
    return { ...photo, uri: dest.uri };
  } catch {
    return photo;
  }
}

/**
 * A saved photo URI that still points at a file, or null. The app container
 * path can change between installs, so a pick copy is looked up by name in
 * today's documents directory too.
 */
export function existingPickUri(uri: string): string | null {
  try {
    if (new File(uri).exists) return uri;
    if (isPickCopy(uri)) {
      const name = uri.split('/').pop();
      if (name) {
        const moved = new File(Paths.document, PICKS_DIR, name);
        if (moved.exists) return moved.uri;
      }
    }
  } catch {
    // An unreadable URI counts as missing.
  }
  return null;
}

/** Slides whose photo file is gone get photo null; missing is how many. */
export function dropMissingPhotos(slides: CreatorSlide[]): { slides: CreatorSlide[]; missing: number } {
  let missing = 0;
  const out = slides.map((s) => {
    if (!s.photo) return s;
    const uri = existingPickUri(s.photo.uri);
    if (uri === null) {
      missing += 1;
      return { ...s, photo: null };
    }
    return uri === s.photo.uri ? s : { ...s, photo: { ...s.photo, uri } };
  });
  return { slides: out, missing };
}

/** Removes the copied pick files behind these slides. */
export function deletePickFiles(slides: CreatorSlide[]): void {
  for (const s of slides) {
    const uri = s.photo?.uri;
    if (!uri || !isPickCopy(uri)) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // Best effort: a leftover file only costs disk.
    }
  }
}

export type ReelDraft = {
  items: ReelPlanItem[];
  caption: string;
  tags: string;
  search: string;
  /** Pauses removed by the auto cut, shown in the editor header. */
  cuts: number;
};

const slideshowKey = (assignmentId: string) => `noni.make.slideshow.${assignmentId}`;
const reelKey = (assignmentId: string) => `noni.make.reel.${assignmentId}`;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A failed local save only costs the draft; the screen state is still live.
  }
}

export function loadSlideshowDraft(assignmentId: string): Promise<SlideshowDraft | null> {
  return readJson<SlideshowDraft>(slideshowKey(assignmentId));
}

export function saveSlideshowDraft(assignmentId: string, draft: SlideshowDraft): Promise<void> {
  return writeJson(slideshowKey(assignmentId), draft);
}

export async function clearSlideshowDraft(assignmentId: string): Promise<void> {
  await AsyncStorage.removeItem(slideshowKey(assignmentId)).catch(() => undefined);
}

export function loadReelDraft(assignmentId: string): Promise<ReelDraft | null> {
  return readJson<ReelDraft>(reelKey(assignmentId));
}

export function saveReelDraft(assignmentId: string, draft: ReelDraft): Promise<void> {
  return writeJson(reelKey(assignmentId), draft);
}

export async function clearReelDraft(assignmentId: string): Promise<void> {
  await AsyncStorage.removeItem(reelKey(assignmentId)).catch(() => undefined);
}
