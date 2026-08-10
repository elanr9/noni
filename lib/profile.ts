import {
  defaultMode,
  profileCanCreate,
  profileIsAdmin,
  type AppMode,
} from './active-mode';
import type { Database } from './types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Role = Profile['role'];
export type { AppMode };

export type AppDestination =
  | '/(auth)/login'
  | '/(onboarding)'
  | '/(admin)/(tabs)'
  | '/(creator)/(tabs)';

export function destinationForProfile(
  profile: Profile | null,
  hasSession: boolean,
  mode?: AppMode | null,
): AppDestination {
  if (!hasSession) return '/(auth)/login';
  if (!profile || !profile.onboarded) return '/(onboarding)';
  const active = mode ?? defaultMode(profile);
  if (profileIsAdmin(profile) && profileCanCreate(profile) && active === 'creator') {
    return '/(creator)/(tabs)';
  }
  if (profileIsAdmin(profile)) return '/(admin)/(tabs)';
  return '/(creator)/(tabs)';
}
