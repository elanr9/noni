import { getShareExtensionKey } from 'expo-share-intent';

/**
 * A link shared to Noni from TikTok or Instagram arrives as a deep link
 * carrying the share extension key. Send it straight to the Library, which
 * reads the shared link and opens the Make it into sheet.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
    return '/(admin)/(tabs)/library';
  }
  return path;
}
