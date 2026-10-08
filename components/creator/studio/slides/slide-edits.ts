import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

import {
  appendSlide,
  newId,
  updateSlide,
  type MediaAsset,
  type Slide,
  type SlideAspect,
  type SlideCrop,
  type SlideshowDocument,
} from '../../../../lib/edit-document';
import { MAX_BOX_SIZE, MIN_BOX_SIZE, newOverlayBox, type OverlayBox } from '../../../../lib/overlay-boxes';
import {
  PLATFORM_SLIDE_ASPECT,
  SLIDE_ASPECT_RATIO,
  SLIDE_PLATFORMS,
  type SlidePlatform,
} from '../../../../lib/submissions';
import { clamp } from '../../slides/frame';
import { centeredCrop, type SourceSize } from '../../slides/photo-crop';
import { nextBoxId } from '../../slides/segment-boxes';

const TIKTOK_ONLY: readonly SlidePlatform[] = ['tiktok'];

/** A 9:16 slideshow also posts to Instagram at 4:5, so it gets a second crop. */
export function cropPlatforms(aspect: SlideAspect): readonly SlidePlatform[] {
  return aspect === PLATFORM_SLIDE_ASPECT.tiktok ? SLIDE_PLATFORMS : TIKTOK_ONLY;
}

export function frameAspect(aspect: SlideAspect, platform: SlidePlatform): number {
  return SLIDE_ASPECT_RATIO[platform === 'tiktok' ? aspect : PLATFORM_SLIDE_ASPECT.instagram];
}

export function slideCrop(slide: Slide, platform: SlidePlatform): SlideCrop | null {
  return platform === 'tiktok' ? slide.crop : slide.instagramCrop;
}

export function withSlideCrop(
  doc: SlideshowDocument,
  slideId: string,
  platform: SlidePlatform,
  crop: SlideCrop,
): SlideshowDocument {
  return updateSlide(doc, slideId, platform === 'tiktok' ? { crop } : { instagramCrop: crop });
}

function readImageSize(uri: string): Promise<SourceSize | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve(width > 0 && height > 0 ? { width, height } : null),
      () => resolve(null),
    );
  });
}

async function imageAsset(picked: ImagePicker.ImagePickerAsset): Promise<MediaAsset> {
  const size =
    picked.width > 0 && picked.height > 0
      ? { width: picked.width, height: picked.height }
      : await readImageSize(picked.uri);
  return {
    id: newId('a'),
    kind: 'image',
    localUri: picked.uri,
    storagePath: null,
    durationMs: null,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

/** Camera roll pick of up to `limit` photos, in the order the creator tapped them. */
export async function pickPhotoAssets(limit: number): Promise<MediaAsset[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 0.9,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, limit).map(imageAsset));
}

export function appendPhotoSlides(doc: SlideshowDocument, assets: MediaAsset[]): SlideshowDocument {
  const ratio = SLIDE_ASPECT_RATIO[doc.aspect];
  return assets.reduce((next, asset) => {
    const source =
      asset.width !== null && asset.height !== null && asset.width > 0 && asset.height > 0
        ? { width: asset.width, height: asset.height }
        : null;
    return appendSlide(next, asset, source ? centeredCrop(source, ratio) : null);
  }, doc);
}

export type BoxPatch = Partial<Pick<OverlayBox, 'x' | 'y' | 'size' | 'width'>>;

export function patchBox(boxes: OverlayBox[], boxId: string, patch: BoxPatch): OverlayBox[] {
  return boxes.map((b) =>
    b.id === boxId
      ? {
          ...b,
          ...patch,
          ...(patch.size !== undefined ? { size: clamp(patch.size, MIN_BOX_SIZE, MAX_BOX_SIZE) } : {}),
        }
      : b,
  );
}

export function newTextBox(boxes: OverlayBox[]): OverlayBox {
  return newOverlayBox({
    id: nextBoxId(boxes),
    text: 'Your text',
    style: 'classic',
    themeColor: null,
    index: boxes.length,
  });
}
