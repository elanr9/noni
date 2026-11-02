// The slideshow maker's local model: one slide per template clip with the
// picked photo, the on-screen text document and the crop. Drafts live in
// AsyncStorage under the brief id so closing the app keeps the work.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { shortLabel, stText, type Brief, type ClipDoc } from '../../../../lib/brief-library';
import type { PickedPhoto } from '../../../../lib/submissions';
import { centeredCrop, type PhotoCrop } from '../../slides/photo-crop';

/** Zoom and pan as the crop step holds them: scale about the centre, then a translate in percent of the frame. */
export type SlideCrop = { z: number; x: number; y: number };

export type Slide = {
  id: string;
  photo: PickedPhoto | null;
  /** Flat text for thumbnails and the submit caption; the doc is the truth. */
  text: string;
  doc: ClipDoc | null;
  crop: SlideCrop | null;
};

export const FRAME_ASPECT = 9 / 16;
const KEY = (briefId: string) => `noni.slides.${briefId}`;

export function slidesFromBrief(b: Brief): Slide[] {
  const clips = b.clips ?? [];
  return clips.map((c, i) => ({ id: `s${i}`, photo: null, text: c.onScreen || shortLabel(c.text) || '', doc: c.doc ?? null, crop: null }));
}

export function slideDoc(s: Slide): ClipDoc {
  return s.doc ?? { texts: s.text ? [stText(s.text)] : [], overlays: [] };
}

export async function loadSlidesDraft(briefId: string): Promise<Slide[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(briefId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Slide[];
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSlidesDraft(briefId: string, slides: Slide[]): void {
  AsyncStorage.setItem(KEY(briefId), JSON.stringify(slides)).catch(() => undefined);
}

export function clearSlidesDraft(briefId: string): void {
  AsyncStorage.removeItem(KEY(briefId)).catch(() => undefined);
}

/** Keep zoom in 1..3 and the pan inside the photo. */
export function clampCrop(n: SlideCrop): SlideCrop {
  const z = Math.max(1, Math.min(3, n.z));
  const lim = ((z - 1) * 50) / z;
  return { z, x: Math.max(-lim, Math.min(lim, n.x)), y: Math.max(-lim, Math.min(lim, n.y)) };
}

/** The window of the source photo that fills the frame after zoom and pan, as fractions of the source. */
export function cropWindow(crop: SlideCrop | null, source: { width: number; height: number }): PhotoCrop {
  const cover = centeredCrop(source, FRAME_ASPECT);
  if (!crop) return cover;
  const w = cover.width / crop.z;
  const h = cover.height / crop.z;
  const x = cover.x + cover.width * (0.5 - crop.x / 100) - w / 2;
  const y = cover.y + cover.height * (0.5 - crop.y / 100) - h / 2;
  return { x: Math.max(0, Math.min(1 - w, x)), y: Math.max(0, Math.min(1 - h, y)), width: w, height: h };
}

/** Photos ready for submitAssignmentPhotos: the TikTok cut from the crop step, Instagram centred on the same window. */
export function photosForSubmit(slides: Slide[]): PickedPhoto[] {
  return slides.flatMap((s) => {
    if (!s.photo) return [];
    if (!s.photo.source) return [s.photo];
    const crop = cropWindow(s.crop, s.photo.source);
    return [{ ...s.photo, crop, cropInstagram: s.photo.cropInstagram ?? centeredCrop(s.photo.source, 4 / 5) }];
  });
}
