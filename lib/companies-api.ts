import { supabase } from './supabase';
import type { Database, Json } from './types';

export type MemberRole = 'company_admin' | 'campaign_manager' | 'creator';

export type CompanyAttention = {
  due: number;
  changesRequested: number;
  toReview: number;
  accountsPending: number;
  creatorsBehind: number;
  unreadMessages: number;
  total: number;
  caughtUp: boolean;
};

export type CompanyMembership = {
  companyId: string;
  name: string;
  slug: string;
  logoPath: string | null;
  role: MemberRole;
  isActive: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  attention: CompanyAttention;
};

function num(source: Record<string, unknown>, key: string): number {
  const v = source[key];
  return typeof v === 'number' ? v : 0;
}

function parseAttention(raw: Json): CompanyAttention {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const total = num(src, 'total');
  return {
    due: num(src, 'due'),
    changesRequested: num(src, 'changes_requested'),
    toReview: num(src, 'to_review'),
    accountsPending: num(src, 'accounts_pending'),
    creatorsBehind: num(src, 'creators_behind'),
    unreadMessages: num(src, 'unread_messages'),
    total,
    caughtUp: src.caught_up === true || total === 0,
  };
}

function parseRole(role: string): MemberRole {
  if (role === 'company_admin' || role === 'creator') return role;
  return 'campaign_manager';
}

/** Every company the signed-in user belongs to, active one first, with badges. */
export async function fetchMyCompanies(): Promise<CompanyMembership[]> {
  const { data, error } = await supabase.rpc('my_companies');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    companyId: row.company_id,
    name: row.name,
    slug: row.slug,
    logoPath: row.logo_path ?? null,
    role: parseRole(row.role),
    isActive: row.is_active,
    joinedAt: row.joined_at,
    lastActiveAt: row.last_active_at ?? null,
    attention: parseAttention(row.attention),
  }));
}

export type CompanyRow = Database['public']['Tables']['companies']['Row'];

/** rpc set_active_company: membership checked server side, raises 42501 otherwise. */
export async function setActiveCompany(companyId: string): Promise<CompanyRow> {
  const { data, error } = await supabase.rpc('set_active_company', {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data;
}

export type CompanyStatus = {
  companyId: string;
  name: string;
  logoPath: string | null;
  role: MemberRole;
  isActive: boolean;
  waiting: number;
  line: string;
  fix: number;
  unread: number;
  shoot: number;
  review: number;
  briefDue: boolean;
};

/** One row per membership, across every company, regardless of the active one. */
export async function fetchCompanyStatusSummary(): Promise<CompanyStatus[]> {
  const { data, error } = await supabase.rpc('company_status_summary');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    companyId: row.company_id,
    name: row.name,
    logoPath: row.logo_path ?? null,
    role: parseRole(row.role),
    isActive: row.is_active,
    waiting: row.waiting,
    line: row.line,
    fix: row.fix,
    unread: row.unread,
    shoot: row.shoot,
    review: row.review,
    briefDue: row.brief_due,
  }));
}

export type CompanyNotification = {
  id: string;
  companyId: string;
  companyName: string;
  companyLogoPath: string | null;
  event: string;
  title: string;
  body: string;
  deepLink: string;
  readAt: string | null;
  createdAt: string;
};

export async function fetchNotificationsFeed(limit = 50): Promise<CompanyNotification[]> {
  const { data, error } = await supabase.rpc('notifications_feed', { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    companyLogoPath: row.company_logo_path ?? null,
    event: row.event,
    title: row.title,
    body: row.body,
    deepLink: row.deep_link,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
  if (error) throw error;
}

/** Public URL for a companies.logo_path object in the company-logos bucket. */
export type CreatorCompanyEarnings = {
  companyId: string | null;
  name: string;
  logoPath: string | null;
  earnedCents: number;
  availableCents: number;
  pendingCents: number;
  isTotal: boolean;
};

/** One row per creator membership plus the is_total row (company_id null). */
export async function fetchCreatorEarningsByCompany(): Promise<CreatorCompanyEarnings[]> {
  const { data, error } = await supabase.rpc('creator_earnings_by_company');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    companyId: row.company_id ?? null,
    name: row.name,
    logoPath: row.logo_path ?? null,
    earnedCents: row.earned_cents,
    availableCents: row.available_cents,
    pendingCents: row.pending_cents,
    isTotal: row.is_total,
  }));
}

export function companyLogoUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  return supabase.storage.from('company-logos').getPublicUrl(logoPath).data.publicUrl;
}

/** Sum of everything waiting on the user across companies other than the active one. */
export function attentionElsewhere(companies: CompanyMembership[]): number {
  return companies
    .filter((c) => !c.isActive)
    .reduce((sum, c) => sum + c.attention.total, 0);
}
