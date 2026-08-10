import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Company pays ceil(G * 1.10); creator receives floor(G * 0.97). */
export function companyDebitCents(grossCents: number): number {
  return Math.ceil(grossCents * 1.1);
}

export function creatorNetCents(grossCents: number): number {
  return Math.floor(grossCents * 0.97);
}

export type SpendKind = 'bounty_debit' | 'streak_debit';

export type SpendResult =
  | {
      ok: true;
      company_debit: number;
      creator_net: number;
      balance_after: number | null;
      idempotent?: boolean;
    }
  | {
      ok: false;
      reason: 'insufficient_credits' | 'invalid_gross' | 'invalid_kind' | string;
    };

function parseSpendPayload(data: unknown): SpendResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'invalid_response' };
  }
  const row = data as Record<string, unknown>;
  if (row.ok === true) {
    return {
      ok: true,
      company_debit: typeof row.company_debit === 'number' ? row.company_debit : 0,
      creator_net: typeof row.creator_net === 'number' ? row.creator_net : 0,
      balance_after:
        typeof row.balance_after === 'number' ? row.balance_after : null,
      idempotent: row.idempotent === true,
    };
  }
  return {
    ok: false,
    reason: typeof row.reason === 'string' ? row.reason : 'unknown',
  };
}

/**
 * Debit company prepaid credits and credit creator net for a bounty/streak.
 * Prefers RPC spend_company_credits_for_earning (service_role).
 */
export async function spendCompanyCreditsForEarning(
  admin: SupabaseClient,
  params: {
    companyId: string;
    creatorId: string;
    assignmentId: string | null;
    grossCents: number;
    kind: SpendKind;
    postId?: string | null;
  },
): Promise<SpendResult> {
  const { data, error } = await admin.rpc('spend_company_credits_for_earning', {
    p_company: params.companyId,
    p_creator: params.creatorId,
    p_assignment: params.assignmentId,
    p_gross_cents: params.grossCents,
    p_kind: params.kind,
    p_post_id: params.postId ?? null,
  });

  if (error) {
    console.error('spend_company_credits_for_earning:', error.message);
    return { ok: false, reason: error.message };
  }
  return parseSpendPayload(data);
}

export function formatCentsDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
