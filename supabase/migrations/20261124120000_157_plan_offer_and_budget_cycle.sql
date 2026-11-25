-- 157: plan agreed on the call, and the monthly creator budget cycle.
--
-- Every company books a call after the onboarding chat. On the call the
-- plan and the monthly creator budget are agreed; ops records the plan as
-- an offer (offer_plan) and the budget in monthly_budget_cents, then sends
-- the company a link. The company starts that exact plan in Stripe Checkout.
--
-- From then on the budget-billing edge function bills the creator budget
-- once a month: what is billed is the budget minus whatever is still on the
-- balance (and minus any budget bill still unpaid), so leftover budget rolls
-- into the next month instead of piling up. One row per company per month
-- in company_budget_invoices; its unique key makes the run safe to repeat.

alter table public.company_billing
  add column if not exists offer_plan text,
  add column if not exists offer_sent_at timestamptz,
  add column if not exists budget_next_invoice_at timestamptz;

create table if not exists public.company_budget_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  period_start date not null,
  budget_cents int not null,
  leftover_cents int not null default 0,
  amount_cents int not null default 0,
  stripe_invoice_id text unique,
  -- billing: being made; open: sent or charging; paid; skipped: leftover
  -- covered the whole budget; void: voided or written off; failed: Stripe
  -- refused to make it (retried on the next run).
  status text not null default 'billing'
    check (status in ('billing', 'open', 'paid', 'skipped', 'void', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_start)
);

create index if not exists company_budget_invoices_company_idx
  on public.company_budget_invoices (company_id, period_start desc);

alter table public.company_budget_invoices enable row level security;

drop policy if exists company_budget_invoices_admin_read on public.company_budget_invoices;
create policy company_budget_invoices_admin_read on public.company_budget_invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = company_budget_invoices.company_id
        and m.profile_id = auth.uid()
        and m.role = 'company_admin'
        and m.removed_at is null
    )
  );

revoke insert, update, delete on public.company_budget_invoices from anon, authenticated;

-- Every 15 minutes: bill any company whose month has come round.
select cron.unschedule('noni-budget-billing')
where exists (select 1 from cron.job where jobname = 'noni-budget-billing');

select cron.schedule(
  'noni-budget-billing',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/budget-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
