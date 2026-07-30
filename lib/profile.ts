import type { Database } from './types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Role = Profile['role'];

export type AppDestination =
  | '/(auth)/login'
  | '/(onboarding)'
  | '/(admin)'
  | '/(creator)';

export function destinationForProfile(
  profile: Profile | null,
  hasSession: boolean,
): AppDestination {
  if (!hasSession) return '/(auth)/login';
  if (!profile || !profile.onboarded) return '/(onboarding)';
  if (profile.role === 'admin') return '/(admin)';
  return '/(creator)';
}
