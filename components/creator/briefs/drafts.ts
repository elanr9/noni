// Local drafts for the creator make flow, keyed by assignment id. The plan
// (slides or clips, text, order) and the local file URIs survive leaving the
// screen with no network; the server side drafts (creator_projects,
// recording_drafts) carry what has uploaded.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CreatorSlide } from './model';
import type { ReelPlanItem } from './reel/plan';

export type SlideshowDraft = {
  slides: CreatorSlide[];
  caption: string;
  tags: string;
  search: string;
};

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
