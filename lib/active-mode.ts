import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Profile } from './profile';

export type AppMode = 'admin' | 'creator' | 'platform';

function modeKey(userId: string): string {
  return `noni.activeMode.${userId}`;
}

export function defaultMode(profile: Profile): AppMode {
  if (profile.role === 'admin') return 'platform';
  return profileIsCampaignManager(profile) ? 'admin' : 'creator';
}

export function profileCanCreate(profile: Profile): boolean {
  return profile.role === 'creator' || profile.can_create === true;
}

/** PostgREST filter: pure creators + dual-role campaign managers. */
export const CREATOR_PROFILE_OR = 'role.eq.creator,can_create.eq.true';

/** Company power: campaign managers and company admins who also run
 *  campaigns (self-as-manager) share the admin product surface. Matches
 *  SQL is_campaign_manager(), which already includes company_admin. */
export function profileIsCampaignManager(profile: Profile): boolean {
  return (
    profile.role === 'campaign_manager' || profile.role === 'company_admin'
  );
}

/** The single Noni platform account; managed on the website, not the app. */
export function profileIsPlatformAdmin(profile: Profile): boolean {
  return profile.role === 'admin';
}

/** The company's one web-only admin; the app points them to usenoni.app. */
export function profileIsCompanyAdmin(profile: Profile): boolean {
  return profile.role === 'company_admin';
}

/** Dual campaign managers can flip; everyone else stays on their only mode. */
export function modesForProfile(profile: Profile): AppMode[] {
  if (profileIsPlatformAdmin(profile)) {
    return ['platform', 'admin', 'creator'];
  }
  if (profileIsCampaignManager(profile) && profileCanCreate(profile)) {
    return ['admin', 'creator'];
  }
  return [defaultMode(profile)];
}

export async function getStoredMode(userId: string): Promise<AppMode | null> {
  const raw = await AsyncStorage.getItem(modeKey(userId));
  if (raw === 'admin' || raw === 'creator' || raw === 'platform') return raw;
  return null;
}

export async function setStoredMode(
  userId: string,
  mode: AppMode,
): Promise<void> {
  await AsyncStorage.setItem(modeKey(userId), mode);
}

export async function resolveMode(profile: Profile): Promise<AppMode> {
  const allowed = modesForProfile(profile);
  const stored = await getStoredMode(profile.id);
  if (stored && allowed.includes(stored)) return stored;
  return allowed[0] ?? defaultMode(profile);
}
