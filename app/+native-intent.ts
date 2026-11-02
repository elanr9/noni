import { getShareExtensionKey } from 'expo-share-intent';

/**
 * A link shared to Noni from TikTok or Instagram arrives as a deep link
 * carrying the share extension key. Open the new brief modal, which reads
 * the shared link into its Add link field.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
    return '/(admin)/new-brief?slot=new';
  }
  return path;
}
