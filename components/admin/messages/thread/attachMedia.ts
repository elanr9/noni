import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { sendMediaMessage } from '../../../../lib/messages-api';

export type MediaTile = 'photo' | 'camera';

/** Library for Photo (images and videos), camera for Camera (images only). */
export async function pickMediaAsset(tile: MediaTile): Promise<ImagePicker.ImagePickerAsset | null> {
  let result: ImagePicker.ImagePickerResult;
  if (tile === 'photo') {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
  } else {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Allow camera access to attach from here.');
      return null;
    }
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  }
  return result.canceled ? null : (result.assets[0] ?? null);
}

export async function sendPickedMedia(params: {
  companyId: string;
  creatorId: string;
  authorId: string;
  asset: ImagePicker.ImagePickerAsset;
  caption: string;
  assignmentId?: string;
}): Promise<void> {
  const isVideo = params.asset.type === 'video';
  await sendMediaMessage({
    companyId: params.companyId,
    creatorId: params.creatorId,
    authorId: params.authorId,
    assignmentId: params.assignmentId,
    media: isVideo ? 'video' : 'image',
    localUri: params.asset.uri,
    contentType: params.asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    durationMs: params.asset.duration,
    caption: params.caption.trim() || undefined,
  });
}
