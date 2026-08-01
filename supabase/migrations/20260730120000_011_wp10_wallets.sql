-- WP10 Money: creator wallets, ledger, payouts + company bounty defaults.
-- attribution_links + revenue_events already exist from 001.

create table public.creator_wallets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  creator_id uuid not null references public.profiles,
  available_cents int not null default 0 check (available_cents >= 0),
  pending_cents int not null default 0 check (pending_cents >= 0),
  stripe_connect_account_id text,
  unique (company_id, creator_id)
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  creator_id uuid not null references public.profiles,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed')),
  stripe_transfer_id text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  creator_id uuid not null references public.profiles,
  kind text not null check (kind in (
    'bounty_credit', 'payout_hold', 'payout_paid', 'payout_failed', 'adjustment'
  )),
  amount_cents int not null,
  post_id uuid references public.posts,
  payout_id uuid references public.payouts,
  note text,
  created_at timestamptz default now(),
  unique (post_id, kind)
);

create index wallet_ledger_creator_created_idx
  on public.wallet_ledger (creator_id, created_at desc);

create index payouts_creator_created_idx
  on public.payouts (creator_id, created_at desc);

create index payouts_stripe_transfer_idx
  on public.payouts (stripe_transfer_id)
  where stripe_transfer_id is not null;

-- Seed bounty defaults on all companies (simple fixed bounty).
update public.companies
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'bounty_amount_cents', 2000,
  'bounty_view_threshold', 5000
)
where coalesce(settings->>'bounty_amount_cents', '') = ''
   or coalesce(settings->>'bounty_view_threshold', '') = '';

alter table public.creator_wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.payouts enable row level security;

-- creator_wallets (creators: own row only; mutations via service role / admin)
create policy "admins read wallets" on public.creator_wallets for select
  using (company_id = public.current_company_id() and public.is_admin());

create policy "creators read own wallet" on public.creator_wallets for select
  using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

create policy "creators insert own wallet" on public.creator_wallets for insert
  with check (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

create policy "admins write wallets" on public.creator_wallets for all
  using (company_id = public.current_company_id() and public.is_admin());

-- wallet_ledger
create policy "admins read ledger" on public.wallet_ledger for select
  using (company_id = public.current_company_id() and public.is_admin());

create policy "creators read own ledger" on public.wallet_ledger for select
  using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

create policy "admins write ledger" on public.wallet_ledger for all
  using (company_id = public.current_company_id() and public.is_admin());

-- payouts
create policy "admins read payouts" on public.payouts for select
  using (company_id = public.current_company_id() and public.is_admin());

create policy "creators read own payouts" on public.payouts for select
  using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

create policy "admins write payouts" on public.payouts for all
  using (company_id = public.current_company_id() and public.is_admin());

grant select, insert, update, delete on public.creator_wallets to anon, authenticated, service_role;
grant select, insert, update, delete on public.wallet_ledger to anon, authenticated, service_role;
grant select, insert, update, delete on public.payouts to anon, authenticated, service_role;
