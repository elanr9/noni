-- Campaign pay terms (owner decision 2026-11-25).
--
-- Every company's campaign carries its own numbers: posts a day, pay per
-- video and per slideshow, the views a post needs before it is paid, pay per
-- 1,000 views and the cap on view pay. Floors: $10 a video, $5 a slideshow,
-- $1 per 1,000 views. New campaigns start at 2 to 3 posts a day, $10, $5,
-- 500 views, $1 per 1,000, $300 cap.
--
-- pay_assignment() reads the company's campaign through company_pay_rates().
-- creator_pay_rates() stays the fallback for a company with no campaign and
-- now matches the same defaults. lib/creator-pay.ts (app and web) mirror it.
--
-- The campaign card is made for the company: a draft campaign is written
-- from what the company told Noni the first time a manager opens Market
-- (ensure_marketplace_listing), with a colour picked from its name.

-- 1. Columns ----------------------------------------------------------------

alter table public.marketplace_listings
  add column if not exists posts_per_day_min int not null default 2 check (posts_per_day_min between 1 and 7),
  add column if not exists posts_per_day_max int not null default 3 check (posts_per_day_max between 1 and 7),
  add column if not exists video_post_cents int not null default 1000 check (video_post_cents >= 1000),
  add column if not exists static_post_cents int not null default 500 check (static_post_cents >= 500),
  add column if not exists cents_per_1k_views int not null default 100 check (cents_per_1k_views >= 100),
  add column if not exists view_pay_cap_cents int not null default 30000 check (view_pay_cap_cents >= 0),
  add column if not exists min_views int not null default 500 check (min_views >= 0),
  add column if not exists brand_color text check (brand_color ~ '^#[0-9A-F]{6}$');

alter table public.marketplace_listings alter column posts_per_week set default 14;

-- 2. Rates ------------------------------------------------------------------

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
    'view_pay_cap_cents', 30000,
    'min_views', 500,
    'view_window_days', 30,
    'noni_fee_bps', 1300
  )
$$;

-- The rates a company's posts are paid at: its campaign's, else the defaults.
create or replace function public.company_pay_rates(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.creator_pay_rates() || coalesce((
    select jsonb_build_object(
      'video_post_cents', l.video_post_cents,
      'static_post_cents', l.static_post_cents,
      'cents_per_1k_views', l.cents_per_1k_views,
      'view_pay_cap_cents', l.view_pay_cap_cents,
      'min_views', l.min_views
    )
    from public.marketplace_listings l
    where l.company_id = p_company_id
    order by (l.status = 'open') desc, l.updated_at desc
    limit 1
  ), '{}'::jsonb)
$$;

revoke all on function public.company_pay_rates(uuid) from public, anon;
grant execute on function public.company_pay_rates(uuid) to authenticated, service_role;

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
  v_rates jsonb;
  v_fee_bps int;
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
  -- The campaign's own rates (migration 163).
  v_rates := public.company_pay_rates(v_a.company_id);
  v_fee_bps := (v_rates->>'noni_fee_bps')::int;

  select coalesce(b.format, 'video') into v_format
  from public.briefs b where b.id = v_a.brief_id;
  v_format := coalesce(v_format, 'video');

  -- Static posts earn only after the manager approves the music (existing rule).
  if v_format = 'photo_carousel' and v_a.music_approved_at is null then
    return jsonb_build_object('ok', true, 'reason', 'awaiting_music_approval',
      'paid_base_cents', 0, 'paid_view_cents', 0);
  end if;

  -- Views never go backwards: a platform undercount cannot claw back pay.
  v_views := greatest(coalesce(p_views, 0), v_a.paid_views);
  -- The post itself is paid once it reaches the campaign's minimum views.
  -- Pay already credited is never taken back.
  v_base_target := case
    when v_views < (v_rates->>'min_views')::int then v_a.base_paid_cents
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

-- 3. The card: colour and agreement -----------------------------------------

-- A flat card colour picked from the company name, the same one every time.
create or replace function public.listing_color(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select (array['#1BA6EE', '#6D4AE0', '#D0397A', '#16A34A', '#F97316', '#0F172A', '#0D9488', '#E11D48'])
    [1 + (abs(hashtext(lower(coalesce(p_name, '')))) % 8)]
$$;

create or replace function public.cents_label(p_cents int)
returns text
language sql
immutable
set search_path = public
as $$
  select '$' || case when p_cents % 100 = 0 then to_char(p_cents / 100, 'FM999,999,990') else to_char(p_cents / 100.0, 'FM999,999,990.00') end
$$;

-- The agreement written from a campaign's own numbers.
create or replace function public.listing_contract(l public.marketplace_listings, p_company text)
returns text
language sql
immutable
set search_path = public
as $$
  select format(
$c$This agreement is between %1$s ("the Company") and you ("the Creator"). It starts the day the Company accepts your application.

1. The work. You make short videos and posts for the Company from the briefs it gives you in Noni, and post them on your own accounts. The target is %2$s a day. Your first post is due within %3$s days of being accepted.

2. Pay. You earn %4$s for each video and %5$s for each slideshow once it is live and has %6$s views, plus %7$s for every 1,000 views in the first 30 days, up to %8$s in view pay per post. Noni pays out to your bank every Sunday.

3. Approval. Every post is reviewed in Noni before it goes live. Only approved posts are paid. Posts must stay up for at least 90 days.

4. Content rights. You keep ownership of what you make. You give the Company a worldwide, royalty free licence to repost, edit and run your content as ads, with no end date, for the content you make under this agreement.

5. Honesty. You follow the brief, say only what the brief allows about the product, and label the content as a paid partnership where the platform or the law requires it. No bought views, likes or followers.

6. Independent creator. You are an independent contractor, not an employee. You are responsible for your own taxes. You are 18 or older.

7. Ending it. Either side can end this agreement at any time in Noni. Posts approved before it ends are still paid.

Typing your name below and tapping Sign has the same effect as a handwritten signature.$c$,
    coalesce(nullif(trim(p_company), ''), 'the Company'),
    case when l.posts_per_day_max > l.posts_per_day_min
      then l.posts_per_day_min || ' to ' || l.posts_per_day_max || ' posts'
      when l.posts_per_day_min = 1 then '1 post' else l.posts_per_day_min || ' posts' end,
    greatest(0, coalesce(l.start_days, 3)),
    public.cents_label(l.video_post_cents),
    public.cents_label(l.static_post_cents),
    to_char(l.min_views, 'FM999,999,990'),
    public.cents_label(l.cents_per_1k_views),
    public.cents_label(l.view_pay_cap_cents)
  );
$$;

grant execute on function public.listing_color(text) to authenticated, service_role;
grant execute on function public.cents_label(int) to authenticated, service_role;
grant execute on function public.listing_contract(public.marketplace_listings, text) to authenticated, service_role;

-- 4. Save -------------------------------------------------------------------

create or replace function public.save_marketplace_listing(p_id uuid, p_patch jsonb)
returns public.marketplace_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company public.companies;
  v_row public.marketplace_listings;
  v_status text;
  v_body text;
  v_auto text;
  v_day_min int;
  v_day_max int;
begin
  if auth.uid() is null or v_company_id is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;
  select * into v_company from public.companies where id = v_company_id;

  if p_id is null then
    insert into public.marketplace_listings (company_id, title, created_by, brand_color)
    values (
      v_company_id,
      coalesce(nullif(trim(p_patch ->> 'title'), ''), v_company.name || ' creators'),
      auth.uid(),
      public.listing_color(v_company.name)
    )
    returning * into v_row;
    update public.marketplace_listings set contract_body = public.listing_contract(v_row, v_company.name)
      where id = v_row.id returning * into v_row;
  else
    select * into v_row from public.marketplace_listings
      where id = p_id and company_id = v_company_id for update;
    if v_row.id is null then
      raise exception 'listing not found';
    end if;
  end if;

  v_status := coalesce(nullif(p_patch ->> 'status', ''), v_row.status);
  if v_status not in ('draft', 'open', 'paused', 'closed') then
    raise exception 'unknown status';
  end if;
  -- An agreement nobody edited follows the campaign's numbers.
  v_auto := public.listing_contract(v_row, v_company.name);
  v_body := case when p_patch ? 'contract_body' and coalesce(p_patch ->> 'contract_body', '') is distinct from v_row.contract_body
    then coalesce(p_patch ->> 'contract_body', '') else v_row.contract_body end;
  v_day_min := least(7, greatest(1, coalesce(nullif(p_patch ->> 'posts_per_day_min', '')::int, v_row.posts_per_day_min)));
  v_day_max := least(7, greatest(v_day_min, coalesce(nullif(p_patch ->> 'posts_per_day_max', '')::int, v_row.posts_per_day_max)));
  if v_status = 'open' and length(trim(v_body)) < 40 then
    raise exception 'Add the agreement creators sign before opening the campaign';
  end if;

  update public.marketplace_listings l set
    title = coalesce(nullif(left(trim(p_patch ->> 'title'), 80), ''), l.title),
    tagline = case when p_patch ? 'tagline' then nullif(left(trim(p_patch ->> 'tagline'), 140), '') else l.tagline end,
    about = case when p_patch ? 'about' then nullif(left(trim(p_patch ->> 'about'), 2000), '') else l.about end,
    requirements = case when p_patch ? 'requirements' then nullif(left(trim(p_patch ->> 'requirements'), 1000), '') else l.requirements end,
    niches = case when jsonb_typeof(p_patch -> 'niches') = 'array'
      then coalesce((select array_agg(distinct lower(trim(v))) from jsonb_array_elements_text(p_patch -> 'niches') v where trim(v) <> ''), '{}')
      else l.niches end,
    platforms = case when jsonb_typeof(p_patch -> 'platforms') = 'array'
      then coalesce((select array_agg(distinct lower(trim(v))) from jsonb_array_elements_text(p_patch -> 'platforms') v where trim(v) <> ''), '{}')
      else l.platforms end,
    posts_per_day_min = v_day_min,
    posts_per_day_max = v_day_max,
    posts_per_week = least(50, v_day_min * 7),
    video_post_cents = greatest(1000, coalesce(nullif(p_patch ->> 'video_post_cents', '')::int, l.video_post_cents)),
    static_post_cents = greatest(500, coalesce(nullif(p_patch ->> 'static_post_cents', '')::int, l.static_post_cents)),
    cents_per_1k_views = greatest(100, coalesce(nullif(p_patch ->> 'cents_per_1k_views', '')::int, l.cents_per_1k_views)),
    view_pay_cap_cents = greatest(0, coalesce(nullif(p_patch ->> 'view_pay_cap_cents', '')::int, l.view_pay_cap_cents)),
    min_views = greatest(0, coalesce(nullif(p_patch ->> 'min_views', '')::int, l.min_views)),
    brand_color = case when (p_patch ->> 'brand_color') ~ '^#[0-9a-fA-F]{6}$' then upper(p_patch ->> 'brand_color') else l.brand_color end,
    spots = case when p_patch ? 'spots' then nullif(p_patch ->> 'spots', '')::int else l.spots end,
    min_age = greatest(18, coalesce(nullif(p_patch ->> 'min_age', '')::int, l.min_age)),
    start_days = coalesce(nullif(p_patch ->> 'start_days', '')::int, l.start_days),
    contract_title = coalesce(nullif(left(trim(p_patch ->> 'contract_title'), 80), ''), l.contract_title),
    contract_body = v_body,
    -- A changed agreement is a new version; signed copies keep their own text.
    contract_version = case when v_body is distinct from l.contract_body and p_id is not null then l.contract_version + 1 else l.contract_version end,
    status = v_status,
    opened_at = case when v_status = 'open' and l.status <> 'open' then now() else l.opened_at end,
    updated_at = now()
  where l.id = v_row.id
  returning * into v_row;
  if v_row.contract_body = v_auto and public.listing_contract(v_row, v_company.name) <> v_auto then
    update public.marketplace_listings
      set contract_body = public.listing_contract(v_row, v_company.name), contract_version = contract_version + 1
      where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- The company's campaign, written for it the first time a manager looks.
create or replace function public.ensure_marketplace_listing()
returns public.marketplace_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company public.companies;
  v_row public.marketplace_listings;
  v_platforms jsonb;
begin
  if auth.uid() is null or v_company_id is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;
  select * into v_row from public.marketplace_listings
    where company_id = v_company_id order by created_at limit 1;
  if v_row.id is not null then
    return v_row;
  end if;
  select * into v_company from public.companies where id = v_company_id;
  v_platforms := case when jsonb_typeof(v_company.intake -> 'platforms') = 'array'
    then (select coalesce(jsonb_agg(lower(p)), '[]'::jsonb) from jsonb_array_elements_text(v_company.intake -> 'platforms') p
          where lower(p) in ('tiktok', 'instagram'))
    else '[]'::jsonb end;
  if jsonb_array_length(v_platforms) = 0 then
    v_platforms := '["tiktok", "instagram"]'::jsonb;
  end if;
  return public.save_marketplace_listing(null, jsonb_build_object(
    'title', v_company.name,
    'tagline', nullif(left(trim(coalesce(v_company.intake ->> 'sells', '')), 140), ''),
    'platforms', v_platforms,
    'spots', case when (v_company.intake ->> 'creators_wanted') ~ '^[0-9]+$'
      then nullif((v_company.intake ->> 'creators_wanted')::int, 0) end
  ));
end;
$$;

revoke all on function public.ensure_marketplace_listing() from public, anon;
grant execute on function public.ensure_marketplace_listing() to authenticated;

-- 5. Feed -------------------------------------------------------------------

drop function if exists public.marketplace_feed();

create or replace function public.marketplace_feed()
returns table (
  id uuid, company_id uuid, company_name text, company_website text,
  status text, title text, tagline text, about text, requirements text,
  niches text[], platforms text[], posts_per_week int, spots int, spots_left int,
  min_age int, start_days int, contract_title text, contract_body text, contract_version int,
  opened_at timestamptz, creator_count int, is_member boolean,
  application_id uuid, application_status text, application_origin text,
  invite_message text, signed_at timestamptz, start_date date, decision_note text,
  niche_overlap int,
  logo_path text, brand_color text, posts_per_day_min int, posts_per_day_max int,
  video_post_cents int, static_post_cents int, cents_per_1k_views int,
  view_pay_cap_cents int, min_views int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id, l.company_id, c.name, c.website,
    l.status, l.title, l.tagline, l.about, l.requirements,
    l.niches, l.platforms, l.posts_per_week, l.spots,
    case when l.spots is null then null
      else greatest(0, l.spots - (select count(*)::int from public.marketplace_applications x where x.listing_id = l.id and x.status = 'accepted')) end,
    l.min_age, l.start_days, l.contract_title, l.contract_body, l.contract_version,
    l.opened_at,
    (select count(*)::int from public.company_members m
      where m.company_id = l.company_id and m.removed_at is null and (m.role = 'creator' or m.can_create)),
    exists (select 1 from public.company_members m
      where m.company_id = l.company_id and m.profile_id = auth.uid() and m.removed_at is null),
    a.id, a.status, a.origin, a.invite_message, a.signed_at, a.start_date, a.decision_note,
    (select count(*)::int from unnest(l.niches) n where n = any (coalesce(cp.niches, '{}'))),
    c.logo_path, coalesce(l.brand_color, public.listing_color(c.name)), l.posts_per_day_min, l.posts_per_day_max,
    l.video_post_cents, l.static_post_cents, l.cents_per_1k_views, l.view_pay_cap_cents, l.min_views
  from public.marketplace_listings l
  join public.companies c on c.id = l.company_id
  left join public.marketplace_applications a on a.listing_id = l.id and a.creator_id = auth.uid()
  left join public.creator_profiles cp on cp.user_id = auth.uid()
  where auth.uid() is not null
    and (l.status = 'open' or a.id is not null)
  order by (a.status = 'invited') desc nulls last, l.opened_at desc nulls last;
$$;

revoke execute on function public.marketplace_feed() from public, anon;
grant execute on function public.marketplace_feed() to authenticated;
