-- Link wallet_ledger rows to Mercury payouts.
--
-- wallet_ledger.payout_id has a foreign key to public.payouts (011). Mercury
-- payouts live in the parallel mercury_payouts table, so writing a Mercury
-- payout id into payout_id fails outright:
--
--   ERROR: insert or update on table "wallet_ledger" violates foreign key
--          constraint "wallet_ledger_payout_id_fkey"
--
-- A second nullable column keeps referential integrity on both rails without
-- touching the Stripe history: Stripe rows populate payout_id, Mercury rows
-- populate mercury_payout_id, and neither table needs to know about the other.

alter table public.wallet_ledger
  add column if not exists mercury_payout_id uuid references public.mercury_payouts;

comment on column public.wallet_ledger.mercury_payout_id is
  'Set on Mercury-rail rows. Stripe-rail rows use payout_id instead; exactly one of the two is non-null on any payout row.';

-- Webhook settlement looks the ledger up by payout.
create index if not exists wallet_ledger_mercury_payout_idx
  on public.wallet_ledger (mercury_payout_id)
  where mercury_payout_id is not null;
