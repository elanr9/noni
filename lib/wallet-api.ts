import { supabase } from './supabase';
import type { Database } from './types';

export type CreatorWallet =
  Database['public']['Tables']['creator_wallets']['Row'];
export type WalletLedgerRow =
  Database['public']['Tables']['wallet_ledger']['Row'];
export type Payout = Database['public']['Tables']['payouts']['Row'];

export async function getOrCreateWallet(
  companyId: string,
  creatorId: string,
): Promise<CreatorWallet> {
  const { data: existing, error: readError } = await supabase
    .from('creator_wallets')
    .select('*')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('creator_wallets')
    .insert({ company_id: companyId, creator_id: creatorId })
    .select('*')
    .single();
  if (error) {
    // Race: another request created it.
    const { data: again, error: againError } = await supabase
      .from('creator_wallets')
      .select('*')
      .eq('company_id', companyId)
      .eq('creator_id', creatorId)
      .single();
    if (againError) throw error;
    return again;
  }
  return data;
}

export async function listLedger(
  creatorId: string,
  limit = 50,
): Promise<WalletLedgerRow[]> {
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function ledgerKindLabel(kind: string): string {
  switch (kind) {
    case 'bounty_credit':
      return 'Bounty credit';
    case 'streak_bonus':
      return 'Streak bonus';
    case 'payout_hold':
      return 'Cash out hold';
    case 'payout_paid':
      return 'Cash out paid';
    case 'payout_failed':
      return 'Cash out failed';
    case 'adjustment':
      return 'Adjustment';
    default:
      return kind;
  }
}
