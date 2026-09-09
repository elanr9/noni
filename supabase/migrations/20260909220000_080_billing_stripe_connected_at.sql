-- Day one for money data in Analytics.
--
-- The app derived the Stripe connect date from company_billing.updated_at,
-- which moves every time the budget changes or a top-up lands, so earlier
-- dollars kept disappearing from the calendar and the Paid out total. The
-- connect moment is stamped once, when a payment method first attaches, and
-- never moves again.

alter table public.company_billing
  add column if not exists stripe_connected_at timestamptz;

create or replace function public.stamp_stripe_connected_at()
returns trigger
language plpgsql
as $$
begin
  if new.stripe_connected_at is null
     and new.stripe_payment_method_id is not null
     and length(new.stripe_payment_method_id) > 0 then
    new.stripe_connected_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists company_billing_stamp_connected on public.company_billing;
create trigger company_billing_stamp_connected
  before insert or update on public.company_billing
  for each row execute function public.stamp_stripe_connected_at();

-- Backfill: the first payout run is the earliest moment money provably moved;
-- otherwise the row's last update is the best date we have.
update public.company_billing b
set stripe_connected_at = coalesce(
  (select min(r.created_at) from public.company_payout_runs r where r.company_id = b.company_id),
  b.updated_at
)
where b.stripe_connected_at is null
  and b.stripe_payment_method_id is not null
  and length(b.stripe_payment_method_id) > 0;
