-- Analytics money gate for every campaign manager.
--
-- company_billing is only readable with manage_billing, so managers holding
-- view_financials alone could not learn the Stripe connect date and fell back
-- on the first payout, hiding real money in between. The date itself carries
-- nothing sensitive, so a narrow definer function hands it to any campaign
-- manager of the company.

create or replace function public.stripe_connected_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select b.stripe_connected_at
  from public.company_billing b
  where b.company_id = public.current_company_id()
    and public.is_campaign_manager()
$$;

revoke all on function public.stripe_connected_at() from public;
grant execute on function public.stripe_connected_at() to authenticated;
