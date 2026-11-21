-- 146: Payout test mode.
--
-- Lets ops run a company end to end (invites, posts, views, creator pay,
-- Sunday payout) before Noni's own bank account is live. In a test company:
--   * "Set up payouts" marks the creator ready without Mercury.
--   * The payout run marks payouts paid without sending money.
--   * Ops can add credits that no card paid for, and set a post's views.
-- Nothing here touches a company that is not in test mode.

alter table public.companies
  add column if not exists payout_test_mode boolean not null default false;

comment on column public.companies.payout_test_mode is
  'Ops-only. Payouts are recorded as paid without moving money, payout setup skips Mercury, and ops can add credits and set views. For trying the product before the bank is live.';

-- Ops: add credits to a test company. Same ledger and balance as a Stripe top-up.
create or replace function public.ops_grant_test_credits(p_company uuid, p_cents int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_balance int;
begin
  if p_cents is null or p_cents <= 0 or p_cents > 10000000 then
    raise exception 'amount must be between 1 cent and $100,000';
  end if;
  if not exists (select 1 from public.companies where id = p_company and payout_test_mode) then
    raise exception 'company is not in payout test mode';
  end if;

  insert into public.company_billing (company_id) values (p_company)
  on conflict (company_id) do nothing;

  update public.company_billing
  set credit_balance_cents = coalesce(credit_balance_cents, 0) + p_cents,
      updated_at = now()
  where company_id = p_company
  returning credit_balance_cents into v_balance;

  insert into public.company_credit_ledger (company_id, kind, amount_cents, gross_cents, fee_cents, note)
  values (p_company, 'adjustment', p_cents, p_cents, 0, 'Test credits (no money charged)');

  return jsonb_build_object('ok', true, 'balance_cents', v_balance);
end
$fn$;

-- Ops: record a view count for a live post in a test company and pay it,
-- exactly as the daily poll would. Views never go down (pay_assignment).
create or replace function public.ops_simulate_post_views(p_post uuid, p_views int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_post public.posts%rowtype;
  v_company uuid;
  v_window_views bigint;
begin
  if p_views is null or p_views < 0 then
    raise exception 'views must be zero or more';
  end if;

  select * into v_post from public.posts where id = p_post;
  if not found then raise exception 'no such post'; end if;
  if v_post.status <> 'posted' then raise exception 'post is not live yet'; end if;
  if v_post.assignment_id is null then raise exception 'post has no assignment'; end if;

  select a.company_id into v_company from public.assignments a where a.id = v_post.assignment_id;
  if not exists (select 1 from public.companies where id = v_company and payout_test_mode) then
    raise exception 'company is not in payout test mode';
  end if;

  insert into public.post_metrics (post_id, views, fetched_at) values (p_post, p_views, now());

  -- Same rule as poll-metrics: per live post, the best count seen inside its
  -- 30-day window, summed across the assignment's posts.
  select coalesce(sum(best), 0) into v_window_views
  from (
    select max(m.views) as best
    from public.posts p
    join public.post_metrics m on m.post_id = p.id
    where p.assignment_id = v_post.assignment_id
      and p.status = 'posted'
      and m.fetched_at <= coalesce(p.posted_at, now())
        + make_interval(days => (public.creator_pay_rates()->>'view_window_days')::int)
    group by p.id
  ) s;

  return public.pay_assignment(v_post.assignment_id, least(v_window_views, 2147483647)::int, p_post);
end
$fn$;

revoke all on function public.ops_grant_test_credits(uuid, int) from public, anon, authenticated;
revoke all on function public.ops_simulate_post_views(uuid, int) from public, anon, authenticated;
grant execute on function public.ops_grant_test_credits(uuid, int) to service_role;
grant execute on function public.ops_simulate_post_views(uuid, int) to service_role;
