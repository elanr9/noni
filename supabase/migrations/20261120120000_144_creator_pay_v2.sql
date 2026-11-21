-- Creator pay v2 (owner decision 2026-11-20).
--
-- A creator takes home, per assignment (one piece of content):
--   $10 for a video post, $5 for a static post (brief format photo_carousel),
--   plus $1 per full 1,000 views, view pay capped at $500 per post,
--   counting only views in the first 30 days after the post went live.
-- The company pays creator pay + 13% Noni fee, from prepaid credits.
-- The flat $20-at-5k-views bounty and streak bonuses are retired.
--
-- Money is moved by pay_assignment(), called by poll-metrics. It is
-- cumulative and idempotent: it pays only the difference between what the
-- assignment has earned and what it has already been paid, so a rerun, a
-- concurrent poll or a later poll after a credits shortfall never double pays.
--
-- The numbers live in creator_pay_rates(); noni-web/src/lib/creator-pay.ts
-- mirrors them for the budget calculator and must be kept in step.

-- 1. Rates ------------------------------------------------------------------

create or replace function public.creator_pay_rates()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'video_post_cents', 1000,
    'static_post_cents', 500,
    'cents_per_1k_views', 100,
    'view_pay_cap_cents', 50000,
    'view_window_days', 30,
    'noni_fee_bps', 1300
  )
$$;

grant execute on function public.creator_pay_rates() to authenticated, service_role;

-- 2. Bookkeeping columns ----------------------------------------------------

alter table public.assignments
  add column if not exists base_paid_cents int not null default 0
    check (base_paid_cents >= 0),
  add column if not exists view_paid_cents int not null default 0
    check (view_paid_cents >= 0),
  add column if not exists paid_views int not null default 0
    check (paid_views >= 0);

comment on column public.assignments.base_paid_cents is
  'Creator take-home already credited for the post itself ($10 video / $5 static).';
comment on column public.assignments.view_paid_cents is
  'Creator take-home already credited for views ($1 per 1k, capped).';
comment on column public.assignments.paid_views is
  'Highest 30-day view count pay has been computed from.';

-- wallet_ledger: post earnings keep kind bounty_credit so every existing
-- earnings reader keeps summing them; pay_part says which part it is.
alter table public.wallet_ledger
  add column if not exists assignment_id uuid references public.assignments on delete set null,
  add column if not exists pay_part text check (pay_part in ('base', 'views'));

-- View pay is credited in several increments per post, so (post_id, kind)
-- can no longer be unique for v2 rows. Keep it for everything else.
alter table public.wallet_ledger drop constraint if exists wallet_ledger_post_id_kind_key;
create unique index if not exists wallet_ledger_post_id_kind_legacy_uidx
  on public.wallet_ledger (post_id, kind)
  where pay_part is null;
create unique index if not exists wallet_ledger_assignment_base_uidx
  on public.wallet_ledger (assignment_id)
  where pay_part = 'base';
create index if not exists wallet_ledger_assignment_idx
  on public.wallet_ledger (assignment_id)
  where assignment_id is not null;

alter table public.company_credit_ledger
  drop constraint if exists company_credit_ledger_kind_check;
alter table public.company_credit_ledger
  add constraint company_credit_ledger_kind_check check (kind in (
    'topup', 'budget', 'bounty_debit', 'streak_debit', 'adjustment', 'fee_company',
    'post_debit', 'view_debit'
  ));
create unique index if not exists company_credit_ledger_assignment_post_debit_uidx
  on public.company_credit_ledger (assignment_id)
  where kind = 'post_debit';

-- 3. Pay one assignment -----------------------------------------------------

-- p_views: the assignment's views inside the 30-day window (summed across its
-- platform posts, best snapshot per post). p_post_id: the post the earning is
-- attributed to in wallet_ledger (per-post earnings in analytics).
create or replace function public.pay_assignment(
  p_assignment uuid,
  p_views int,
  p_post_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rates jsonb := public.creator_pay_rates();
  v_fee_bps int := (v_rates->>'noni_fee_bps')::int;
  v_a public.assignments%rowtype;
  v_format text;
  v_base_target int;
  v_views int;
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

  select coalesce(b.format, 'video') into v_format
  from public.briefs b where b.id = v_a.brief_id;
  v_format := coalesce(v_format, 'video');

  -- Static posts earn only after the manager approves the music (existing rule).
  if v_format = 'photo_carousel' and v_a.music_approved_at is null then
    return jsonb_build_object('ok', true, 'reason', 'awaiting_music_approval',
      'paid_base_cents', 0, 'paid_view_cents', 0);
  end if;

  v_base_target := case when v_format = 'photo_carousel'
    then (v_rates->>'static_post_cents')::int
    else (v_rates->>'video_post_cents')::int end;
  -- Views never go backwards: a platform undercount cannot claw back pay.
  v_views := greatest(coalesce(p_views, 0), v_a.paid_views);
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
          || ' (creator pay + 13% fee)'
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
        'Views: ' || to_char(v_views, 'FM999,999,999') || ' (creator pay + 13% fee)'
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

revoke all on function public.pay_assignment(uuid, int, uuid) from public, anon, authenticated;
grant execute on function public.pay_assignment(uuid, int, uuid) to service_role;

-- 4. Retire streak bonuses --------------------------------------------------
-- Streak counting stays (the app shows streaks); the money stops.

create or replace function public.streak_bonus_cents(p_days int, p_settings jsonb)
returns int
language sql
immutable
set search_path = public
as $$ select 0 $$;

update public.companies
set settings = settings - 'streak_milestones' - 'bounty_amount_cents' - 'bounty_view_threshold'
where settings ?| array['streak_milestones', 'bounty_amount_cents', 'bounty_view_threshold'];
