// Camera roll and camera picks as PickedPhoto, with the TikTok 9:16 and
// Instagram 4:5 crops centred to start.
import * as ImagePicker from 'expo-image-picker';

import type { PickedPhoto } from '../../../../lib/submissions';
import { centeredCrop } from '../../slides/photo-crop';

export const TIKTOK_ASPECT = 9 / 16;
export const INSTAGRAM_ASPECT = 4 / 5;

export function pickedPhotoFromAsset(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  const source = asset.width > 0 && asset.height > 0 ? { width: asset.width, height: asset.height } : undefined;
  const photo: PickedPhoto = { uri: asset.uri, mimeType: asset.mimeType ?? null };
  if (source) {
    photo.source = source;
    photo.crop = centeredCrop(source, TIKTOK_ASPECT);
    photo.cropInstagram = centeredCrop(source, INSTAGRAM_ASPECT);
  }
  return photo;
}

/** Camera roll. limit 1 returns at most one photo; more opens multi select. */
export async function pickFromLibrary(limit = 1): Promise<PickedPhoto[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
  });
  if (result.canceled) return [];
  return result.assets.map(pickedPhotoFromAsset);
}

export async function takePhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  if (result.canceled || !result.assets[0]) return null;
  return pickedPhotoFromAsset(result.assets[0]);
}
