import { requireOptionalNativeModule } from 'expo-modules-core';

type ClipJoinerNativeModule = {
  joinClips(uris: string[]): Promise<string>;
};

const nativeModule = requireOptionalNativeModule<ClipJoinerNativeModule>('ClipJoiner');

export function isClipJoinerAvailable(): boolean {
  return nativeModule !== null;
}

export async function joinClips(uris: string[]): Promise<string> {
  if (uris.length === 0) {
    throw new Error('joinClips requires at least one clip URI.');
  }
  if (uris.length === 1) {
    return uris[0];
  }
  if (!nativeModule) {
    throw new Error(
      'ClipJoiner native module is not available. Rebuild the dev client to include modules/clip-joiner.'
    );
  }
  try {
    return await nativeModule.joinClips(uris);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to join clips: ${message}`);
  }
}
