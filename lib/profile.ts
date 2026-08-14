import {
  defaultMode,
  profileCanCreate,
  profileIsCampaignManager,
  profileIsPlatformAdmin,
  type AppMode,
} from './active-mode';
import type { Database, Json } from './types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

// Sign-in is invite only, and the signup trigger stamps the inviting company
// onto the profile, so every profile has a company from creation.
export type Profile = ProfileRow & { company_id: string };
export type Role = Profile['role'];
export type { AppMode };

export type AppDestination =
  | '/(auth)/login'
  | '/(auth)/invite-required'
  | '/(onboarding)'
  | '/(admin)/(tabs)'
  | '/(admin)/(tabs)/setup'
  | '/(creator)/(tabs)'
  | '/platform-admin'
  | '/company-admin';

/**
 * The temporary admin Onboarding tab (replaces Creators) retires once the
 * manager finishes their checklist; the flag lives in profiles.onboarding_answers.
 */
export function isManagerSetupCompleteFlag(answers: Json | null): boolean {
  return (
    answers !== null &&
    typeof answers === 'object' &&
    !Array.isArray(answers) &&
    answers.manager_setup_complete === true
  );
}

export function destinationForProfile(
  profile: Profile | null,
  hasSession: boolean,
  mode?: AppMode | null,
): AppDestination {
  if (!hasSession) return '/(auth)/login';
  // A session with no profile means the signup trigger found no invite for
  // that email. Sign-in is invite only, so the account is blocked.
  if (!profile) return '/(auth)/invite-required';
  if (profileIsPlatformAdmin(profile)) {
    const active = mode ?? defaultMode(profile);
    if (active === 'admin') return '/(admin)/(tabs)';
    if (active === 'creator') return '/(creator)/(tabs)';
    return '/platform-admin';
  }
  // Old unattached creator rows (pre invite-only trigger) have no company.
  if (!profile.company_id) return '/(auth)/invite-required';
  if (!profile.onboarded) return '/(onboarding)';
  const active = mode ?? defaultMode(profile);
  if (
    profileIsCampaignManager(profile) &&
    profileCanCreate(profile) &&
    active === 'creator'
  ) {
    return '/(creator)/(tabs)';
  }
  if (profileIsCampaignManager(profile)) {
    // Company admins already finished setup on the web. Fresh invited
    // managers land on the temporary Onboarding tab until the checklist is done.
    if (profile.role === 'company_admin') return '/(admin)/(tabs)';
    return isManagerSetupCompleteFlag(profile.onboarding_answers)
      ? '/(admin)/(tabs)'
      : '/(admin)/(tabs)/setup';
  }
  return '/(creator)/(tabs)';
}
