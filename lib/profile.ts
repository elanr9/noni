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
// onto the profile, so every profile has an active company from creation.
export type Profile = ProfileRow & { active_company_id: string };
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

// Flags that are true per company live in profiles.onboarding_answers as
// { "<company id>": true } maps: one person can be set up in one company and
// new in another. Migration 139 carried the older person-wide flags
// (setup_complete, manager_setup_complete, creator_invited) into them.
export const SETUP_COMPLETE_KEY = 'setup_complete_companies';
export const MANAGER_SETUP_COMPLETE_KEY = 'manager_setup_complete_companies';
export const CREATOR_INVITED_KEY = 'creator_invited_companies';

function jsonRecord(value: Json | null | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

export function hasCompanyFlag(
  answers: Json | null,
  key: string,
  companyId: string | null | undefined,
): boolean {
  if (!companyId) return false;
  return jsonRecord(jsonRecord(answers)[key])[companyId] === true;
}

/** The answers with one company added to a per-company flag map. */
export function withCompanyFlag(
  answers: Json | null,
  key: string,
  companyId: string,
): Record<string, Json> {
  const record = jsonRecord(answers);
  return { ...record, [key]: { ...jsonRecord(record[key]), [companyId]: true } };
}

/** Creator setup (accounts, connect, warm-up) is finished in this company. */
export function isSetupCompleteFlag(
  answers: Json | null,
  companyId: string | null | undefined,
): boolean {
  return hasCompanyFlag(answers, SETUP_COMPLETE_KEY, companyId);
}

/**
 * The temporary admin Onboarding tab (replaces Creators) retires once the
 * manager finishes the checklist for this company.
 */
export function isManagerSetupCompleteFlag(
  answers: Json | null,
  companyId: string | null | undefined,
): boolean {
  return hasCompanyFlag(answers, MANAGER_SETUP_COMPLETE_KEY, companyId);
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
  if (!profile.active_company_id) return '/(auth)/invite-required';
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
    return isManagerSetupCompleteFlag(
      profile.onboarding_answers,
      profile.active_company_id,
    )
      ? '/(admin)/(tabs)'
      : '/(admin)/(tabs)/setup';
  }
  return '/(creator)/(tabs)';
}
