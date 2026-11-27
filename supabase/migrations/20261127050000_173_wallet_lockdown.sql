-- 173: only the server moves creator money.
--
-- The Sunday payout sends whatever creator_wallets.available_cents says, from
-- Noni's own bank account. Until now a company's managers could write wallets,
-- the ledger and payout rows straight from the API, and a creator could insert
-- their own wallet with any balance, a recipient id and payout_ready set. Either
-- could have had the payout run send money nobody earned.
--
-- Balances, the ledger and payouts are now written only by the service role
-- (edge functions) and the security definer pay functions. Everyone keeps
-- read access to their own rows. A creator may still open an empty wallet,
-- which is what the app does the first time Earnings loads.

drop policy if exists "admins write wallets" on public.creator_wallets;
drop policy if exists "admins write ledger" on public.wallet_ledger;
drop policy if exists "admins write mercury payouts" on public.mercury_payouts;
drop policy if exists "admins write payouts" on public.payouts;

drop policy if exists "creators insert own wallet" on public.creator_wallets;
create policy "creators insert own wallet" on public.creator_wallets
  for insert
  with check (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
    and available_cents = 0
    and pending_cents = 0
    and payout_ready = false
    and payout_rail = 'stripe'
    and stripe_connect_account_id is null
    and mercury_recipient_id is null
    and mercury_invite_id is null
    and mercury_onboarding_url is null
    and mercury_invite_status = 'none'
    and mercury_w9_status = 'none'
    and mercury_invite_sent_at is null
    and mercury_invite_reminder_sent_at is null
    and mercury_onboarded_at is null
  );

revoke insert, update, delete, truncate on public.creator_wallets from anon;
revoke update, delete, truncate on public.creator_wallets from authenticated;
revoke insert, update, delete, truncate on
  public.wallet_ledger, public.mercury_payouts, public.payouts,
  public.mercury_webhook_events, public.company_payout_runs
  from anon, authenticated;

-- One atomic step for a balance change, so a payout settling or failing can
-- never overwrite pay credited in the same moment.
create or replace function public.wallet_move(p_wallet uuid, p_available int, p_pending int)
returns public.creator_wallets
language sql
security definer
set search_path = public
as $$
  update public.creator_wallets
     set available_cents = available_cents + p_available,
         pending_cents = greatest(0, pending_cents + p_pending)
   where id = p_wallet
  returning *;
$$;

revoke all on function public.wallet_move(uuid, int, int) from public, anon, authenticated;
grant execute on function public.wallet_move(uuid, int, int) to service_role;

-- What the ledger says a creator is owed. The payout run refuses to pay a
-- wallet whose balance does not match it.
create or replace function public.wallet_ledger_balance(p_company uuid, p_creator uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::bigint
  from public.wallet_ledger
  where company_id = p_company and creator_id = p_creator;
$$;

revoke all on function public.wallet_ledger_balance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wallet_ledger_balance(uuid, uuid) to service_role;

-- The run fires on the hour, so Sunday's payout starts at 8:00 PM Eastern
-- (it was 8:10), with a second pass at 8:30 for anything the first one missed.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'noni-mercury-weekly-payouts'),
  schedule := '0,30 * * * *'
);
