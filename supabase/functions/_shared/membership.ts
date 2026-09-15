import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Manager-side membership roles on company_members. */
export const MANAGER_MEMBER_ROLES = ['campaign_manager', 'company_admin'];

/** Active membership role of profileId in companyId, or null when not a member. */
export async function memberRole(
  admin: SupabaseClient,
  profileId: string,
  companyId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('company_members')
    .select('role')
    .eq('profile_id', profileId)
    .eq('company_id', companyId)
    .is('removed_at', null)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export async function isMemberOf(
  admin: SupabaseClient,
  profileId: string,
  companyId: string,
  platformAdmin = false,
): Promise<boolean> {
  if (platformAdmin) return true;
  return (await memberRole(admin, profileId, companyId)) !== null;
}

export async function isManagerOf(
  admin: SupabaseClient,
  profileId: string,
  companyId: string,
  platformAdmin = false,
): Promise<boolean> {
  if (platformAdmin) return true;
  const role = await memberRole(admin, profileId, companyId);
  return role !== null && MANAGER_MEMBER_ROLES.includes(role);
}
