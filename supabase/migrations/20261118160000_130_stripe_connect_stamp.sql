-- Day one for money data, for companies that connect Stripe on the web.
--
-- 080 stamped stripe_connected_at only when a payment method attached (the
-- old in-app card flow). Companies now connect their own Stripe account on
-- the web through read-only Connect OAuth, which writes stripe_account_id and
-- never a payment method, so their connect date stayed null and money
-- surfaces stayed gated shut. Stamp on either, once.

create or replace function public.stamp_stripe_connected_at()
returns trigger
language plpgsql
as $$
begin
  if new.stripe_connected_at is null
     and (
       (new.stripe_payment_method_id is not null and length(new.stripe_payment_method_id) > 0)
       or (new.stripe_account_id is not null and length(new.stripe_account_id) > 0)
     ) then
    new.stripe_connected_at := now();
  end if;
  return new;
end;
$$;

update public.company_billing
set stripe_connected_at = updated_at
where stripe_connected_at is null
  and stripe_account_id is not null
  and length(stripe_account_id) > 0;
