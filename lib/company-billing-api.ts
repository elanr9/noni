import { supabase } from './supabase';

export type CompanyBillingStatus = {
  company_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  bank_last4: string | null;
  bank_name: string | null;
  payouts_enabled: boolean;
  weekly_budget_cents: number;
  monthly_budget_cents: number;
  credit_balance_cents: number;
  bank_connected: boolean;
  updated_at: string;
};

export async function getBillingStatus(): Promise<CompanyBillingStatus> {
  const { data, error } = await supabase.functions.invoke('company-billing', {
    body: { action: 'status' },
  });
  if (error) throw error;
  const payload = data as CompanyBillingStatus & { error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload;
}

export async function getTopUpUrl(amountCents: number): Promise<string> {
  const { data, error } = await supabase.functions.invoke('company-billing', {
    body: { action: 'topup_url', amount_cents: amountCents },
  });
  if (error) throw error;
  const payload = data as { url?: string; error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!payload.url) throw new Error('No top-up URL returned');
  return payload.url;
}

/** Optional saved card / bank for faster checkout. */
export async function getPaymentMethodSetupUrl(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('company-billing', {
    body: { action: 'setup_url' },
  });
  if (error) throw error;
  const payload = data as { url?: string; error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!payload.url) throw new Error('No setup URL returned');
  return payload.url;
}

/** @deprecated Use getPaymentMethodSetupUrl */
export async function getBankSetupUrl(): Promise<string> {
  return getPaymentMethodSetupUrl();
}

export async function setMonthlyBudget(
  monthlyBudgetCents: number,
): Promise<{
  monthly_budget_cents: number;
  credit_balance_cents: number;
  bank_connected: boolean;
  warn: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('company-billing', {
    body: { action: 'set_budget', monthly_budget_cents: monthlyBudgetCents },
  });
  if (error) throw error;
  const payload = data as {
    monthly_budget_cents?: number;
    credit_balance_cents?: number;
    bank_connected?: boolean;
    warn?: string | null;
    error?: string;
  };
  if (payload.error) throw new Error(payload.error);
  if (typeof payload.monthly_budget_cents !== 'number') {
    throw new Error('Budget update failed');
  }
  return {
    monthly_budget_cents: payload.monthly_budget_cents,
    credit_balance_cents: payload.credit_balance_cents ?? 0,
    bank_connected: payload.bank_connected === true,
    warn: payload.warn ?? null,
  };
}

/** @deprecated Use setMonthlyBudget */
export async function setWeeklyBudget(
  weeklyBudgetCents: number,
): Promise<{ weekly_budget_cents: number; bank_connected: boolean; warn: string | null }> {
  const result = await setMonthlyBudget(weeklyBudgetCents * 4);
  return {
    weekly_budget_cents: Math.floor(result.monthly_budget_cents / 4),
    bank_connected: result.bank_connected,
    warn: result.warn,
  };
}

export function formatBudgetDollars(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
