import { supabase } from './supabase';
import { parseOverlayThemeColor } from './overlay-boxes';
import { CREATOR_ROSTER_OR } from './active-mode';

/** Web console for Brand Brain, features, team permissions and billing. */
export const WEB_CONSOLE_URL = 'https://www.usenoni.app/admin';
export const TERMS_URL = 'https://www.usenoni.app/terms';

/**
 * TikTok's own text background palette, so a company theme reads like a
 * native caption. Content data stored on companies.settings, not UI colour.
 */
export const TEXT_THEME_SWATCHES = [
  '#EA403F',
  '#FF933D',
  '#F2CD46',
  '#78C25E',
  '#3496F0',
  '#5756D4',
  '#F7D7E9',
  '#EB4C89',
  '#000000',
] as const;

export type TeamMember = {
  id: string;
  name: string;
  role: 'company_admin' | 'campaign_manager';
  photo: string | null;
  lastActiveAt: string | null;
};

export type InvitedManager = { id: string; email: string; createdAt: string };

export type CompanySettingsSummary = {
  name: string;
  themeColor: string | null;
  creatorCount: number;
};

/** The active company's name, post text theme and creator count. */
export async function fetchCompanySettings(companyId: string): Promise<CompanySettingsSummary> {
  const [company, creators] = await Promise.all([
    supabase.from('companies').select('name, settings').eq('id', companyId).maybeSingle(),
    supabase
      .from('company_roster')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or(CREATOR_ROSTER_OR),
  ]);
  if (company.error) throw company.error;
  if (creators.error) throw creators.error;
  return {
    name: company.data?.name ?? 'Your company',
    themeColor: parseOverlayThemeColor(company.data?.settings ?? null),
    creatorCount: creators.count ?? 0,
  };
}

/** Company admins and campaign managers of one company, admins first. */
export async function listTeam(companyId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('company_roster')
    .select('id, full_name, avatar_path, member_role, last_active_at')
    .eq('company_id', companyId)
    .in('member_role', ['company_admin', 'campaign_manager'])
    .order('full_name');
  if (error) throw error;
  const rows = (data ?? []).filter((r): r is typeof r & { id: string } => r.id !== null);
  const paths = rows.map((r) => r.avatar_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from('avatars').createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  return rows
    .map((r) => ({
      id: r.id,
      name: r.full_name?.trim() || 'Campaign manager',
      role: (r.member_role === 'company_admin' ? 'company_admin' : 'campaign_manager') as TeamMember['role'],
      photo: r.avatar_path ? signed.get(r.avatar_path) ?? null : null,
      lastActiveAt: r.last_active_at,
    }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'company_admin' ? -1 : 1));
}

/** Pending campaign manager invites for the company (visible to members who can invite). */
export async function listPendingManagerInvites(companyId: string): Promise<InvitedManager[]> {
  const { data, error } = await supabase
    .from('company_invites')
    .select('id, email, created_at')
    .eq('company_id', companyId)
    .eq('role', 'campaign_manager')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  // RLS hides invites from managers without invite rights; that is not an error here.
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, email: r.email, createdAt: r.created_at }));
}

/** Emails a campaign manager invite for the company. Needs invite_members. */
export async function inviteManager(companyId: string, name: string, email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('invite-campaign-manager', {
    body: { action: 'invite', company_id: companyId, role: 'campaign_manager', name, email },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    throw new Error(friendlyInviteError(body?.error) ?? 'Could not send the invite. Try again.');
  }
  const result = data as { error?: string } | null;
  if (result?.error) throw new Error(friendlyInviteError(result.error) ?? result.error);
}

function friendlyInviteError(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw.includes('already a member')) return 'That person is already on this team.';
  if (raw.includes('forbidden') || raw.includes('permission')) return 'You do not have permission to invite managers. Ask your company admin.';
  return raw;
}
