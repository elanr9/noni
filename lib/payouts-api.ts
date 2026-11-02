/**
 * The creator's own payouts (Earnings tab): the wallet balance that may be
 * paid out, what is still clearing, and the payout history. Payout rails run
 * through the wallet row (Mercury onboarding URL, payout_ready).
 */
import { supabase } from './supabase';
import type { Database } from './types';
import { getOrCreateWallet, type CreatorWallet } from './wallet-api';

export type Payout = Database['public']['Tables']['payouts']['Row'];
export type PayoutStatus = 'paid' | 'on_the_way' | 'failed';

export type PayoutSummary = {
  wallet: CreatorWallet;
  payouts: Payout[];
  /** Completed payouts, cents, all time. */
  paidCents: number;
};

export function payoutStatus(p: Payout): PayoutStatus {
  if (p.completed_at || p.status === 'completed' || p.status === 'paid') return 'paid';
  if (p.status === 'failed') return 'failed';
  return 'on_the_way';
}

export function payoutStatusLabel(s: PayoutStatus): string {
  return s === 'paid' ? 'Paid' : s === 'failed' ? 'Failed' : 'On the way';
}

/** "Not set up", "Setting up" or "Ready": where the creator's payout account stands. */
export function payoutSetupLabel(w: CreatorWallet): 'Not set up' | 'Setting up' | 'Ready' {
  if (w.payout_ready) return 'Ready';
  if (w.mercury_onboarding_url || w.mercury_invite_sent_at) return 'Setting up';
  return 'Not set up';
}

export async function listPayouts(companyId: string, creatorId: string, limit = 50): Promise<Payout[]> {
  const { data, error } = await supabase
    .from('payouts')
    .select('*')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function loadPayoutSummary(companyId: string, creatorId: string): Promise<PayoutSummary> {
  const [wallet, payouts] = await Promise.all([getOrCreateWallet(companyId, creatorId), listPayouts(companyId, creatorId)]);
  const paidCents = payouts.filter((p) => payoutStatus(p) === 'paid').reduce((n, p) => n + p.amount_cents, 0);
  return { wallet, payouts, paidCents };
}

/** Completed payouts whose day falls in [from, to), cents. */
export function paidBetween(payouts: Payout[], from: Date, to: Date): number {
  return payouts.reduce((n, p) => {
    if (payoutStatus(p) !== 'paid') return n;
    const at = new Date(p.completed_at ?? p.created_at ?? 0);
    return at >= from && at < to ? n + p.amount_cents : n;
  }, 0);
}
