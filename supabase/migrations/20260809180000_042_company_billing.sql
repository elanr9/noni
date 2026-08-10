-- Company ACH billing + weekly creator payout batch runs.
-- Budget lives on company_billing only (not companies.settings).

create table public.company_billing (
  company_id uuid primary key references public.companies,
  stripe_customer_id text,
  stripe_payment_method_id text,
  bank_last4 text,
  bank_name text,
  payouts_enabled boolean not null default false,
  weekly_budget_cents int not null default 0 check (weekly_budget_cents >= 0),
  updated_at timestamptz not null default now()
);

create table public.company_payout_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  period_start date not null,
  period_end date not null,
  charged_cents int not null default 0 check (charged_cents >= 0),
  creators_paid int not null default 0 check (creators_paid >= 0),
  stripe_payment_intent_id text,
  status text not null default 'pending'
    check (status in ('pending', 'charged', 'transferred', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (company_id, period_end)
);

create index company_payout_runs_company_created_idx
  on public.company_payout_runs (company_id, created_at desc);

alter table public.company_billing enable row level security;
alter table public.company_payout_runs enable row level security;

create policy "admins select company billing" on public.company_billing
  for select using (company_id = public.current_company_id() and public.is_admin());

create policy "admins update company billing" on public.company_billing
  for update using (company_id = public.current_company_id() and public.is_admin());

create policy "admins select payout runs" on public.company_payout_runs
  for select using (company_id = public.current_company_id() and public.is_admin());

grant select, insert, update, delete on public.company_billing to anon, authenticated, service_role;
grant select, insert, update, delete on public.company_payout_runs to anon, authenticated, service_role;

-- Hourly at :10; edge function only runs when America/New_York is Sunday 20:00–20:59.
select cron.schedule(
  'noni-weekly-payouts',
  '10 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/weekly-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
