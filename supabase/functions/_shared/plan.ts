// Server-side plan enforcement: the paywall and the per-campaign creator cap.
//
// A port of noni-web src/lib/plans.ts (PLAN_CREATOR_CAP, capUpgradeHint) and
// src/lib/admin/billing.ts (parseStoredPlan, companyPlanAccess,
// creatorInviteBlock, publishBlock, companyCreatorCount). The web checks
// these in its own server actions; the edge functions check them again so
// the app and direct calls cannot bypass the plan. Keep the rules and the
// copy in step with the web files.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PlanTier = 'starter' | 'premium' | 'enterprise';

/** Who is told about a block: admins fix it in Billing, managers and ops
    hand it to the company admin. */
export type GateAudience = 'admin' | 'manager' | 'ops';

/** Creators per campaign on each plan. Null means unlimited. */
export const PLAN_CREATOR_CAP: Record<PlanTier, number | null> = {
  starter: 5,
  premium: 15,
  enterprise: null,
};

/** subscription_plan values Checkout writes, by tier (web PLAN_PRICING). */
const STORED_PLAN_TIER: Record<string, PlanTier> = {
  starter_monthly: 'starter',
  starter_annual: 'starter',
  premium_monthly: 'premium',
  premium_annual: 'premium',
};

/** The in-house testing company. Mirrors IN_HOUSE_COMPANY_ID in noni-web
    src/lib/admin/billing.ts, which is a constant there too. */
export const IN_HOUSE_COMPANY_ID = '59f83fa9-8c5b-44aa-814e-f7cc863eac3b';

/** Statuses that keep a company running. past_due is Stripe's retry window. */
const ENTITLED_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

export function capUpgradeHint(tier: PlanTier): string {
  const cap = PLAN_CREATOR_CAP[tier];
  if (tier === 'starter') {
    return `Starter allows ${cap} creators per campaign. Upgrade to Premium for ${PLAN_CREATOR_CAP.premium}.`;
  }
  if (tier === 'premium') {
    return `Premium allows ${cap} creators per campaign. Contact us about Enterprise for unlimited creators.`;
  }
  return '';
}

/** Legacy single-plan rows ("monthly"/"annual") are grandfathered as Premium. */
export function parseStoredTier(value: string | null): PlanTier {
  if (value && value in STORED_PLAN_TIER) return STORED_PLAN_TIER[value];
  if (value === 'enterprise') return 'enterprise';
  return 'premium';
}

export interface PlanAccess {
  entitled: boolean;
  status: string;
  tier: PlanTier | null;
  cap: number | null;
  pilot: boolean;
}

export interface PlanBlock {
  error: string;
  upgrade: true;
}

export async function companyPlanAccess(
  admin: SupabaseClient,
  companyId: string,
): Promise<PlanAccess> {
  const { data } = await admin
    .from('company_billing')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  const str = (k: string) => (typeof row?.[k] === 'string' ? (row[k] as string) : null);
  const status = str('subscription_status') ?? 'none';
  const plan = str('subscription_plan');
  if (status !== 'none' && plan !== null) {
    const tier = parseStoredTier(plan);
    return {
      entitled: ENTITLED_STATUSES.has(status),
      status,
      tier,
      cap: PLAN_CREATOR_CAP[tier],
      pilot: false,
    };
  }
  /* Pilots ops runs by hand (the in-house company, or billing_simulated set)
     keep working without a plan. Everyone else hits the paywall. */
  const pilot = companyId === IN_HOUSE_COMPANY_ID || row?.billing_simulated === true;
  return { entitled: pilot, status, tier: null, cap: null, pilot };
}

function paywallMessage(access: PlanAccess, action: string, audience: GateAudience): string {
  if (access.status === 'unpaid') {
    return audience === 'admin'
      ? `Your last payment failed, so ${action} is paused. Update your card in Billing to pick up where you left off.`
      : `The company's last Noni payment failed, so ${action} is paused until the company admin updates the card in Billing.`;
  }
  return audience === 'admin'
    ? `Pick a plan in Billing to start ${action}. Every plan includes campaigns, briefs, approvals and payouts; plans differ only in how many creators run on a campaign.`
    : `This company needs a Noni plan before ${action}. Ask the company admin to pick one in Billing.`;
}

function capMessage(tier: PlanTier, audience: GateAudience, lead?: string): string {
  const who = audience === 'admin' ? '' : ' Ask the company admin to upgrade in Billing.';
  return `${lead ? `${lead} ` : ''}${capUpgradeHint(tier)}${who}`;
}

/** Accepted creators plus pending, unexpired creator invites. */
export async function companyCreatorCount(
  admin: SupabaseClient,
  companyId: string,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const [profiles, invites] = await Promise.all([
    admin
      .from('company_roster')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('member_role', 'creator'),
    admin
      .from('company_invites')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('role', 'creator')
      .is('accepted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ]);
  if (profiles.error) throw profiles.error;
  if (invites.error) throw invites.error;
  return (profiles.count ?? 0) + (invites.count ?? 0);
}

/** Null when one more creator invite is allowed, else what blocks it. */
export async function creatorInviteBlock(
  admin: SupabaseClient,
  companyId: string,
  audience: GateAudience,
): Promise<PlanBlock | null> {
  const access = await companyPlanAccess(admin, companyId);
  if (!access.entitled) {
    return { error: paywallMessage(access, 'inviting creators', audience), upgrade: true };
  }
  if (access.tier === null || access.cap === null) return null;
  const creators = await companyCreatorCount(admin, companyId);
  if (creators < access.cap) return null;
  return {
    error: capMessage(
      access.tier,
      audience,
      `Your team already has ${creators} creators, counting pending invites.`,
    ),
    upgrade: true,
  };
}

/** Null when the company may publish to `reach` creators, else what blocks
    it. `reach` is publish-campaign's audience: roster creators (or members
    who can create) with an approved account, as web publishAudienceCount. */
export async function publishBlock(
  admin: SupabaseClient,
  companyId: string,
  audience: GateAudience,
  reach: number,
): Promise<PlanBlock | null> {
  const access = await companyPlanAccess(admin, companyId);
  if (!access.entitled) {
    return { error: paywallMessage(access, 'publishing campaigns', audience), upgrade: true };
  }
  if (access.tier === null || access.cap === null) return null;
  if (reach <= access.cap) return null;
  return {
    error: capMessage(access.tier, audience, `This campaign would go to ${reach} creators.`),
    upgrade: true,
  };
}

/** The audience for a block message from the caller's standing. */
export async function gateAudience(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<GateAudience> {
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.role === 'admin') return 'ops';
  const { data } = await admin
    .from('company_members')
    .select('role')
    .eq('profile_id', userId)
    .eq('company_id', companyId)
    .is('removed_at', null)
    .maybeSingle();
  return data?.role === 'company_admin' ? 'admin' : 'manager';
}
