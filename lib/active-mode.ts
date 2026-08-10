import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Profile } from './profile';

export type AppMode = 'admin' | 'creator';

function modeKey(userId: string): string {
  return `noni.activeMode.${userId}`;
}

export function defaultMode(profile: Profile): AppMode {
  return profile.role === 'admin' ? 'admin' : 'creator';
}

export function profileCanCreate(profile: Profile): boolean {
  return profile.role === 'creator' || profile.can_create === true;
}

/** PostgREST filter: pure creators + dual-role admins. */
export const CREATOR_PROFILE_OR = 'role.eq.creator,can_create.eq.true';

export function profileIsAdmin(profile: Profile): boolean {
  return profile.role === 'admin';
}

/** Dual admins can flip; pure creators/admins stay on their only mode. */
export function modesForProfile(profile: Profile): AppMode[] {
  if (profileIsAdmin(profile) && profileCanCreate(profile)) {
    return ['admin', 'creator'];
  }
  return [defaultMode(profile)];
}

export async function getStoredMode(userId: string): Promise<AppMode | null> {
  const raw = await AsyncStorage.getItem(modeKey(userId));
  if (raw === 'admin' || raw === 'creator') return raw;
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
