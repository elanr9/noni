/**
 * Upload-Post returns each linked social as either a bare handle string or an
 * object with profile details, and an empty string for a profile that exists
 * but has never completed OAuth. One parser so the setup gate, the connect
 * screen, and the profile tab all agree on what "connected" means.
 */

export type SocialAccountInfo = {
  connected: boolean;
  handle: string | null;
  followers: number | null;
};

export const DISCONNECTED: SocialAccountInfo = {
  connected: false,
  handle: null,
  followers: null,
};

export function parseSocialAccount(value: unknown): SocialAccountInfo {
  if (!value) return DISCONNECTED;
  if (typeof value === 'string') {
    return value.length > 0
      ? { connected: true, handle: value, followers: null }
      : DISCONNECTED;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const handle =
      typeof obj.username === 'string'
        ? obj.username
        : typeof obj.display_name === 'string'
          ? obj.display_name
          : null;
    const raw = obj.followers ?? obj.follower_count;
    const followers =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
    return { connected: true, handle, followers };
  }
  return { connected: true, handle: null, followers: null };
}

export function formatHandle(handle: string): string {
  return `@${handle.replace(/^@/, '')}`;
}

export function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
}

export function socialAccountSummary(info: SocialAccountInfo): string {
  if (!info.connected) return 'Not connected';
  if (!info.handle) return 'Connected';
  const handle = formatHandle(info.handle);
  return info.followers !== null
    ? `${handle} · ${formatFollowers(info.followers)} followers`
    : handle;
}
