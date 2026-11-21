/**
 * The creator's own payouts (Earnings tab): the wallet balance that may be
 * paid out, what is still clearing, and the payout history. Payout rails run
 * through the wallet row (Mercury onboarding URL, payout_ready).
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { getOrCreateWallet, type CreatorWallet } from './wallet-api';

/**
 * One payout to the creator's bank, from either rail: Mercury (mercury_payouts,
 * current) or the old Stripe rail (payouts). completed_at is set once the
 * money has landed.
 */
export type Payout = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string | null;
  completed_at: string | null;
};
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
  const [mercury, stripe] = await Promise.all([
    supabase
      .from('mercury_payouts')
      .select('id, amount_cents, status, created_at, settled_at')
      .eq('company_id', companyId)
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('payouts')
      .select('id, amount_cents, status, created_at, completed_at')
      .eq('company_id', companyId)
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);
  if (mercury.error) throw mercury.error;
  if (stripe.error) throw stripe.error;
  const rows: Payout[] = [
    // Mercury: 'sent' + settled_at is money in the bank; 'reversed' came back.
    ...(mercury.data ?? []).map((m) => ({
      id: m.id,
      amount_cents: m.amount_cents,
      status: m.status === 'reversed' ? 'failed' : m.status,
      created_at: m.created_at,
      completed_at: m.status === 'sent' ? m.settled_at : null,
    })),
    ...(stripe.data ?? []).map((p) => ({
      id: p.id,
      amount_cents: p.amount_cents,
      status: p.status,
      created_at: p.created_at,
      completed_at: p.completed_at,
    })),
  ];
  rows.sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''));
  return rows.slice(0, limit);
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

type PayoutSetupResponse = { success?: boolean; already_set_up?: boolean; ready?: boolean; message?: string; error?: string };

async function invokePayoutFunction(name: 'mercury-create-invite' | 'mercury-verify-onboarding'): Promise<PayoutSetupResponse> {
  const { data, error } = await supabase.functions.invoke(name, { body: {} });
  if (!error) return (data ?? {}) as PayoutSetupResponse;
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await (error.context as Response).json()) as PayoutSetupResponse;
      // verify-onboarding answers "start setup first" as a 400 with a message.
      if (body.message && !body.error) return body;
      throw new Error(body.error ?? body.message ?? 'Payout setup is unavailable right now. Try again shortly.');
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
    }
  }
  throw new Error('Could not reach Noni. Check your connection and try again.');
}

/**
 * Starts bank setup: Mercury emails the creator a secure link to add their
 * bank and tax details. Safe to call again; it sends a fresh link.
 * Resolves with whether the creator is already set up.
 */
export async function startPayoutSetup(): Promise<{ alreadySetUp: boolean }> {
  const res = await invokePayoutFunction('mercury-create-invite');
  return { alreadySetUp: res.already_set_up === true };
}

/** After the creator finishes Mercury's form: confirms it and marks them payable. */
export async function checkPayoutSetup(): Promise<{ ready: boolean; message: string }> {
  const res = await invokePayoutFunction('mercury-verify-onboarding');
  return {
    ready: res.ready === true,
    message: res.message ?? (res.ready ? "You're all set. Payouts run Sunday evenings." : 'Not finished yet.'),
  };
}
