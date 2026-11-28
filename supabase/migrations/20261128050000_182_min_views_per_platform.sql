-- 182: the minimum views count per platform (owner decision 2026-11-28).
--
-- A video is cross posted to TikTok and Instagram. View pay ($1 per 1,000)
-- counts both platforms combined. The post itself ($10 video, $5 slideshow)
-- is paid only once one platform's post alone reaches the campaign's minimum
-- (500): 300 on TikTok plus 300 on Instagram is not enough.
--
-- pay_assignment() gains p_best_post_views, the best single platform count
-- inside the 30 day window. Left null, it falls back to p_views so an older
-- caller keeps working.

drop function if exists public.pay_assignment(uuid, int, uuid);

create or replace function public.pay_assignment(
  p_assignment uuid,
  p_views int,
  p_post_id uuid default null,
  p_best_post_views int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rates jsonb;
  v_fee_bps int;
  v_a public.assignments%rowtype;
  v_format text;
  v_base_target int;
  v_views int;
  v_best int;
  v_view_target int;
  v_base_owed int;
  v_view_owed int;
  v_balance int;
  v_debit int;
  v_paid_base int := 0;
  v_paid_views int := 0;
  v_short boolean := false;
begin
  select * into v_a from public.assignments where id = p_assignment for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_assignment');
  end if;
  v_rates := public.company_pay_rates(v_a.company_id);
  v_fee_bps := coalesce((v_rates->>'noni_fee_bps')::int, 0);

  select coalesce(b.format, 'video') into v_format
  from public.briefs b where b.id = v_a.brief_id;
  v_format := coalesce(v_format, 'video');

  -- Static posts earn only after the manager approves the music.
  if v_format = 'photo_carousel' and v_a.music_approved_at is null then
    return jsonb_build_object('ok', true, 'reason', 'awaiting_music_approval',
      'paid_base_cents', 0, 'paid_view_cents', 0);
  end if;

  -- Views never go backwards: a platform undercount cannot claw back pay.
  -- Combined views, for view pay.
  v_views := greatest(coalesce(p_views, 0), v_a.paid_views);
  -- One platform's views, for the minimum.
  v_best := coalesce(p_best_post_views, coalesce(p_views, 0));

  -- Base pay once one platform's post reaches the minimum. Pay already
  -- credited is never taken back.
  v_base_target := case
    when v_best < (v_rates->>'min_views')::int then v_a.base_paid_cents
    when v_format = 'photo_carousel' then (v_rates->>'static_post_cents')::int
    else (v_rates->>'video_post_cents')::int end;
  v_view_target := least(
    (v_views / 1000) * (v_rates->>'cents_per_1k_views')::int,
    (v_rates->>'view_pay_cap_cents')::int
  );

  v_base_owed := greatest(v_base_target - v_a.base_paid_cents, 0);
  v_view_owed := greatest(v_view_target - v_a.view_paid_cents, 0);

  if v_base_owed = 0 and v_view_owed = 0 then
    update public.assignments set paid_views = v_views
    where id = p_assignment and paid_views <> v_views;
    return jsonb_build_object('ok', true, 'paid_base_cents', 0, 'paid_view_cents', 0);
  end if;

  insert into public.company_billing (company_id) values (v_a.company_id)
  on conflict (company_id) do nothing;
  select credit_balance_cents into v_balance
  from public.company_billing where company_id = v_a.company_id for update;

  insert into public.creator_wallets (company_id, creator_id)
  values (v_a.company_id, v_a.creator_id)
  on conflict (company_id, creator_id) do nothing;

  -- Base first: it is the guaranteed part. Each part is all-or-nothing.
  if v_base_owed > 0 then
    v_debit := ceil(v_base_owed * (10000 + v_fee_bps) / 10000.0)::int;
    if v_balance >= v_debit then
      v_balance := v_balance - v_debit;
      insert into public.company_credit_ledger (
        company_id, kind, amount_cents, gross_cents, fee_cents,
        assignment_id, creator_id, note
      ) values (
        v_a.company_id, 'post_debit', -v_debit, v_base_owed, v_debit - v_base_owed,
        p_assignment, v_a.creator_id,
        case when v_format = 'photo_carousel' then 'Static post' else 'Video post' end
      );
      insert into public.wallet_ledger (
        company_id, creator_id, kind, amount_cents, post_id, assignment_id, pay_part, note
      ) values (
        v_a.company_id, v_a.creator_id, 'bounty_credit', v_base_owed, p_post_id,
        p_assignment, 'base',
        case when v_format = 'photo_carousel' then 'Static post' else 'Video post' end
      );
      v_paid_base := v_base_owed;
    else
      v_short := true;
    end if;
  end if;

  if v_view_owed > 0 and not v_short then
    v_debit := ceil(v_view_owed * (10000 + v_fee_bps) / 10000.0)::int;
    if v_balance >= v_debit then
      v_balance := v_balance - v_debit;
      insert into public.company_credit_ledger (
        company_id, kind, amount_cents, gross_cents, fee_cents,
        assignment_id, creator_id, note
      ) values (
        v_a.company_id, 'view_debit', -v_debit, v_view_owed, v_debit - v_view_owed,
        p_assignment, v_a.creator_id,
        'Views: ' || to_char(v_views, 'FM999,999,999')
      );
      insert into public.wallet_ledger (
        company_id, creator_id, kind, amount_cents, post_id, assignment_id, pay_part, note
      ) values (
        v_a.company_id, v_a.creator_id, 'bounty_credit', v_view_owed, p_post_id,
        p_assignment, 'views',
        'Views: ' || to_char(v_views, 'FM999,999,999')
      );
      v_paid_views := v_view_owed;
    else
      v_short := true;
    end if;
  end if;

  if v_paid_base + v_paid_views > 0 then
    update public.company_billing
    set credit_balance_cents = v_balance, updated_at = now()
    where company_id = v_a.company_id;

    update public.creator_wallets
    set available_cents = available_cents + v_paid_base + v_paid_views
    where company_id = v_a.company_id and creator_id = v_a.creator_id;
  end if;

  -- paid_views only advances when view pay is settled, so a shortfall is
  -- retried at the same count on the next poll.
  update public.assignments
  set base_paid_cents = base_paid_cents + v_paid_base,
      view_paid_cents = view_paid_cents + v_paid_views,
      paid_views = case when v_view_owed = v_paid_views then v_views else paid_views end,
      bounty_amount_cents = base_paid_cents + view_paid_cents + v_paid_base + v_paid_views,
      bounty_credited_at = coalesce(bounty_credited_at,
        case when v_paid_base + v_paid_views > 0 then now() end)
  where id = p_assignment;

  return jsonb_build_object(
    'ok', not v_short,
    'reason', case when v_short then 'insufficient_credits' end,
    'paid_base_cents', v_paid_base,
    'paid_view_cents', v_paid_views,
    'balance_after', v_balance,
    'creator_id', v_a.creator_id,
    'company_id', v_a.company_id
  );
end
$fn$;

revoke all on function public.pay_assignment(uuid, int, uuid, int) from public, anon, authenticated;
grant execute on function public.pay_assignment(uuid, int, uuid, int) to service_role;

-- Ops test payouts follow the same rule as poll-metrics.
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
  v_best_views bigint;
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

  -- Per live post, the best count inside its 30 day window: summed for view
  -- pay, the single best one for the minimum.
  select coalesce(sum(best), 0), coalesce(max(best), 0)
  into v_window_views, v_best_views
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

  return public.pay_assignment(
    v_post.assignment_id,
    least(v_window_views, 2147483647)::int,
    p_post,
    least(v_best_views, 2147483647)::int
  );
end
$fn$;

-- The agreement says it plainly. Unedited campaign agreements are rewritten.
create temporary table _unedited_listings_182 on commit drop as
  select l.id
  from public.marketplace_listings l
  join public.companies c on c.id = l.company_id
  where l.contract_body = public.listing_contract(l, c.name);

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'listing_contract';
  if v_def is null then
    raise exception 'listing_contract not found';
  end if;
  v_def := replace(v_def,
    $o$Views: %5$s for every 1,000 views in the 30 days after posting$o$,
    $n$Views: %5$s for every 1,000 views, TikTok and Instagram combined, in the 30 days after posting$n$);
  v_def := replace(v_def,
    $o$' views'$o$,
    $n$' views on TikTok or Instagram'$n$);
  execute v_def;
end;
$$;

update public.marketplace_listings l
set contract_body = public.listing_contract(l, c.name),
    contract_version = l.contract_version + 1
from public.companies c
where c.id = l.company_id
  and l.id in (select id from _unedited_listings_182);
