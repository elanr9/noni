/** The creator's own earnings figures for Home (money is shown to creators, never on the admin app). */
import { supabase } from './supabase';

function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Cents credited to the creator's wallet in this company since the first of this month. */
export async function earnedThisMonth(companyId: string, creatorId: string): Promise<number> {
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('amount_cents')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .gt('amount_cents', 0)
    .gte('created_at', monthStart().toISOString());
  if (error) throw error;
  return (data ?? []).reduce((n, r) => n + r.amount_cents, 0);
}
