-- Companies Noni runs itself, whose sales live in Noni's own Stripe account.
-- Stripe Connect cannot link a platform to itself, so these companies read
-- that account directly. Only the service role may read or write this table:
-- a company admin can edit company_billing, so the permission cannot sit there.
create table if not exists public.platform_stripe_companies (
  company_id uuid primary key references public.companies (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_stripe_companies enable row level security;
revoke all on public.platform_stripe_companies from anon, authenticated;
