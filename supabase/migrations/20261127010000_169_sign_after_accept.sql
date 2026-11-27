-- 169: the agreement is made for one creator and signed after the company
-- says yes.
--
-- Before: a creator signed the campaign's generic agreement to apply. Now a
-- creator applies with one tap. When the company accepts (or invites), Noni
-- writes that creator's own agreement: both names, the date, the campaign and
-- the pay exactly as the campaign's numbers stand. The creator opens it in
-- the app, signs, and is in. Status 'offered' is accepted and waiting on the
-- signature.
--
-- The licence now says outright that the company may repost the content on
-- its own accounts, edit it and run it as ads, and adds ad codes, original
-- work (commercial music) and confidentiality.

-- 1. Status ------------------------------------------------------------------

alter table public.marketplace_applications
  drop constraint if exists marketplace_applications_status_check;
alter table public.marketplace_applications
  add constraint marketplace_applications_status_check
  check (status in ('invited', 'applied', 'offered', 'accepted', 'declined', 'withdrawn'));

-- 2. The terms, written from the campaign's own numbers ------------------------

create temporary table _unedited_listings on commit drop as
  select l.id
  from public.marketplace_listings l
  join public.companies c on c.id = l.company_id
  where l.contract_body = public.listing_contract(l, c.name);

-- The numbered terms. The opening line naming both sides is added per creator
-- by creator_contract(). p_company is kept for callers; the terms say "the
-- Company" and "the Creator" so one text reads right for everyone.
create or replace function public.listing_contract(l public.marketplace_listings, p_company text)
returns text
language sql
immutable
set search_path = public
as $$
  select format(
$c$1. The work. The Creator makes short videos and posts for the Company from the briefs in Noni and posts them on the Creator's own accounts. The target is %1$s a day. The first post is due within %2$s days of signing.

2. Pay. Noni tracks views and pays the Creator on the Company's behalf.
Video: %3$s %7$s
Slideshow: %4$s %7$s
Views: %5$s for every 1,000 views in the 30 days after posting, up to %6$s a post
Payout: every Sunday to the Creator's bank
Only posts approved in Noni are paid. Drafts and unpublished posts are not paid. A post that is deleted, made private or taken down by the platform within 30 days of posting is not paid. Expenses are not reimbursed.

3. Approval. Every post is reviewed in Noni before it goes live. Posts stay up for at least 90 days.

4. Content rights. The Creator keeps ownership of the content. The Creator gives the Company a worldwide, royalty free licence with no end date to use, copy, edit and share the content made under this agreement. The Company may repost it on its own social accounts, website and app store pages, run it as paid ads, cut it together with other clips, and add captions, music or its logo. The licence continues after this agreement ends, and the Creator will not ask for the content to be taken down.

5. Name and face. The licence covers the Creator's name, handle, voice and likeness as they appear in the content.

6. Ad codes. When the Company asks, the Creator gives it the platform's ad code for a post (TikTok Spark Ads, Instagram partnership ads) so the Company can run that post as an ad.

7. Original work. The content is the Creator's own. It uses only music and sounds the platform clears for commercial use, and shows no other person, brand or copyrighted work without permission.

8. Honesty. The Creator follows the brief, says only what the brief allows about the product, and labels the content as a paid partnership where the platform or the law requires it. No bought views, likes or followers.

9. Confidentiality. The Creator keeps briefs, unreleased product details and the terms of this agreement private.

10. Independent contractor. The Creator is an independent contractor, not an employee, agent or partner of the Company, and is responsible for the Creator's own taxes. The Creator is 18 or older.

11. Tax forms. The Creator gives Noni a W-9 before the first payout, or a W-8BEN outside the United States. Noni sends a 1099-NEC for each year the Creator's pay reaches the IRS reporting amount.

12. Ending it. Either side can end this agreement at any time in Noni. Posts approved before it ends are still paid, and the licence in section 4 stays.

13. Signing. Both sides agree to sign and receive this agreement electronically. Typing a full name and tapping Sign has the same effect as a handwritten signature.$c$,
    case when l.posts_per_day_max > l.posts_per_day_min
      then l.posts_per_day_min || ' to ' || l.posts_per_day_max || ' posts'
      when l.posts_per_day_min = 1 then '1 post' else l.posts_per_day_min || ' posts' end,
    greatest(1, coalesce(l.start_days, 3)),
    public.cents_label(l.video_post_cents),
    public.cents_label(l.static_post_cents),
    public.cents_label(l.cents_per_1k_views),
    public.cents_label(l.view_pay_cap_cents),
    case when coalesce(l.min_views, 0) > 0
      then 'once it is live and has ' || to_char(l.min_views, 'FM999,999,990') || ' views'
      else 'once it is live' end
  );
$$;

update public.marketplace_listings l
set contract_body = public.listing_contract(l, c.name),
    contract_version = l.contract_version + 1
from public.companies c
where c.id = l.company_id
  and l.id in (select id from _unedited_listings);

-- One creator's agreement: who, when, which campaign, then the terms.
create or replace function public.creator_contract(p_listing public.marketplace_listings, p_creator uuid)
returns text
language sql
stable
set search_path = public
as $$
  select format(
    'This Creator Agreement is made on %1$s between %2$s ("the Company") and %3$s ("the Creator") for the campaign "%4$s". It starts the day the Creator signs.',
    to_char(public.company_local_date(p_listing.company_id), 'FMMonth FMDD, YYYY'),
    coalesce(nullif(trim(c.name), ''), 'the Company'),
    coalesce(nullif(trim(p.full_name), ''), 'the Creator'),
    coalesce(nullif(trim(p_listing.title), ''), c.name)
  ) || E'\n\n' || trim(p_listing.contract_body)
  from public.companies c
  left join public.profiles p on p.id = p_creator
  where c.id = p_listing.company_id;
$$;

revoke all on function public.creator_contract(public.marketplace_listings, uuid) from public, anon, authenticated;

-- 3. Invite: the company reaches out, so the agreement is ready at once --------

create or replace function public.invite_creator_to_listing(p_listing_id uuid, p_creator_id uuid, p_message text default null)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.marketplace_listings;
  v_company public.companies;
  v_app public.marketplace_applications;
  v_body text;
begin
  if auth.uid() is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;
  select * into v_listing from public.marketplace_listings
    where id = p_listing_id and company_id = public.current_company_id();
  if v_listing.id is null then
    raise exception 'listing not found';
  end if;
  if length(trim(v_listing.contract_body)) < 40 then
    raise exception 'Add the agreement creators sign before inviting';
  end if;
  if not exists (select 1 from public.profiles where id = p_creator_id) then
    raise exception 'creator not found';
  end if;
  if exists (
    select 1 from public.company_members m
    where m.company_id = v_listing.company_id and m.profile_id = p_creator_id
      and m.removed_at is null and (m.role = 'creator' or m.can_create)
  ) then
    raise exception 'They already create for you';
  end if;

  select * into v_app from public.marketplace_applications
    where listing_id = p_listing_id and creator_id = p_creator_id for update;
  if v_app.id is not null and v_app.status = 'applied' then
    raise exception 'They already applied. Accept them from Applicants.';
  end if;
  if v_app.id is not null and v_app.status = 'offered' then
    raise exception 'They are accepted and have the agreement to sign.';
  end if;

  v_body := public.creator_contract(v_listing, p_creator_id);

  insert into public.marketplace_applications (
    listing_id, company_id, creator_id, origin, status, invite_message, invited_by,
    contract_title, contract_body, contract_version, contract_sha256
  )
  values (
    p_listing_id, v_listing.company_id, p_creator_id, 'invited', 'invited', nullif(left(trim(p_message), 600), ''), auth.uid(),
    v_listing.contract_title, v_body, v_listing.contract_version, encode(sha256(convert_to(v_body, 'UTF8')), 'hex')
  )
  on conflict (listing_id, creator_id) do update
    set origin = 'invited', status = 'invited',
        invite_message = excluded.invite_message, invited_by = excluded.invited_by,
        signed_name = null, signed_at = null,
        contract_title = excluded.contract_title, contract_body = excluded.contract_body,
        contract_version = excluded.contract_version, contract_sha256 = excluded.contract_sha256,
        decided_by = null, decided_at = null, decision_note = null, start_date = null,
        updated_at = now()
  returning * into v_app;

  select * into v_company from public.companies where id = v_listing.company_id;
  perform public.marketplace_notify(
    v_listing.company_id, array[p_creator_id], 'marketplace_invite',
    v_company.name || ' wants you',
    coalesce(v_app.invite_message, 'They invited you to ' || v_listing.title || '. Sign the agreement and you are in.'),
    'noni://creator/' || v_listing.company_id || '/market/' || v_listing.id,
    jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id)
  );
  return v_app;
end;
$$;

-- 4. Apply: one tap, nothing to sign yet ---------------------------------------

-- p_signed_name is only used when the creator is taking an invite, where the
-- agreement is already written: that signs it (kept so app builds from before
-- this migration still work).
create or replace function public.apply_to_listing(p_listing_id uuid, p_signed_name text default null, p_note text default null)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.marketplace_listings;
  v_profile public.profiles;
  v_cp public.creator_profiles;
  v_app public.marketplace_applications;
  v_age int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null then
    raise exception 'Your account is still in review';
  end if;
  select * into v_listing from public.marketplace_listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'campaign not found';
  end if;
  select * into v_app from public.marketplace_applications
    where listing_id = p_listing_id and creator_id = v_uid for update;

  if v_app.id is not null and v_app.status in ('invited', 'offered') then
    return public.sign_creator_agreement(v_app.id, p_signed_name);
  end if;
  if v_listing.status <> 'open' then
    raise exception 'This campaign is not taking applications right now';
  end if;
  if v_app.id is not null and v_app.status in ('applied', 'accepted') then
    return v_app;
  end if;
  if exists (
    select 1 from public.company_members m
    where m.company_id = v_listing.company_id and m.profile_id = v_uid
      and m.removed_at is null and (m.role = 'creator' or m.can_create)
  ) then
    raise exception 'You already create for this company';
  end if;

  select * into v_cp from public.creator_profiles where user_id = v_uid;
  if v_cp.birth_year is null then
    raise exception 'Add your age to your profile before you apply';
  end if;
  v_age := extract(year from now())::int - v_cp.birth_year;
  if v_age < greatest(18, v_listing.min_age) then
    raise exception 'This campaign is for creators % and older', greatest(18, v_listing.min_age);
  end if;
  if coalesce(v_cp.tiktok, v_cp.instagram) is null then
    raise exception 'Add your TikTok or Instagram to your profile before you apply';
  end if;

  insert into public.marketplace_applications (listing_id, company_id, creator_id, origin, status, note)
  values (p_listing_id, v_listing.company_id, v_uid, 'applied', 'applied', nullif(left(trim(p_note), 600), ''))
  on conflict (listing_id, creator_id) do update
    set status = 'applied', origin = 'applied',
        note = coalesce(excluded.note, marketplace_applications.note),
        contract_title = null, contract_body = null, contract_version = null, contract_sha256 = null,
        signed_name = null, signed_at = null,
        decided_by = null, decided_at = null, decision_note = null, start_date = null,
        updated_at = now()
  returning * into v_app;

  perform public.marketplace_notify(
    v_listing.company_id, public.marketplace_manager_ids(v_listing.company_id), 'marketplace_application',
    coalesce(v_profile.full_name, 'A creator') || ' applied',
    'Accept or decline in Market.',
    'noni://manager/' || v_listing.company_id || '/market',
    jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id, 'creator_id', v_uid)
  );
  return v_app;
end;
$$;

-- 5. Decide: accepting writes the creator's agreement and waits for the signature

create or replace function public.decide_marketplace_application(p_id uuid, p_accept boolean, p_note text default null, p_start_date date default null)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.marketplace_applications;
  v_listing public.marketplace_listings;
  v_company public.companies;
  v_body text;
begin
  if auth.uid() is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;
  select * into v_app from public.marketplace_applications
    where id = p_id and company_id = public.current_company_id() for update;
  if v_app.id is null then
    raise exception 'application not found';
  end if;
  if v_app.status = 'accepted' or (v_app.status = 'offered' and p_accept) then
    return v_app;
  end if;
  if v_app.status not in ('applied', 'offered') then
    raise exception 'This application is not waiting on you';
  end if;
  select * into v_listing from public.marketplace_listings where id = v_app.listing_id;
  select * into v_company from public.companies where id = v_app.company_id;

  if p_accept then
    if length(trim(v_listing.contract_body)) < 40 then
      raise exception 'Add the agreement creators sign before accepting';
    end if;
    if v_listing.spots is not null and (
      select count(*) from public.marketplace_applications a
      where a.listing_id = v_listing.id and a.status in ('accepted', 'offered')
    ) >= v_listing.spots then
      raise exception 'Every spot on this campaign is taken. Raise the number of spots to accept more.';
    end if;
    v_body := public.creator_contract(v_listing, v_app.creator_id);
    update public.marketplace_applications
      set status = 'offered', decided_by = auth.uid(), decided_at = now(),
          decision_note = nullif(trim(p_note), ''),
          -- A start date the manager picked is kept; otherwise it is set at signing.
          start_date = p_start_date,
          contract_title = v_listing.contract_title, contract_body = v_body,
          contract_version = v_listing.contract_version,
          contract_sha256 = encode(sha256(convert_to(v_body, 'UTF8')), 'hex'),
          signed_name = null, signed_at = null,
          updated_at = now()
      where id = p_id returning * into v_app;
    perform public.marketplace_notify(
      v_app.company_id, array[v_app.creator_id], 'marketplace_accepted',
      v_company.name || ' accepted you',
      'Sign your agreement to start.',
      'noni://creator/' || v_app.company_id || '/market/' || v_listing.id,
      jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id)
    );
  else
    update public.marketplace_applications
      set status = 'declined', decided_by = auth.uid(), decided_at = now(),
          decision_note = nullif(trim(p_note), ''), updated_at = now()
      where id = p_id returning * into v_app;
    perform public.marketplace_notify(
      v_app.company_id, array[v_app.creator_id], 'marketplace_declined',
      v_company.name || ' passed this time',
      'Plenty more campaigns are open in the marketplace.',
      'noni://creator/' || v_app.company_id || '/market',
      jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id)
    );
  end if;
  return v_app;
end;
$$;

-- 6. Sign: the creator signs their agreement and joins --------------------------

create or replace function public.sign_creator_agreement(p_application_id uuid, p_signed_name text)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.marketplace_applications;
  v_listing public.marketplace_listings;
  v_profile public.profiles;
  v_cp public.creator_profiles;
  v_name text := regexp_replace(trim(coalesce(p_signed_name, '')), '\s+', ' ', 'g');
  v_start date;
  v_invited boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_app from public.marketplace_applications
    where id = p_application_id and creator_id = v_uid for update;
  if v_app.id is null then
    raise exception 'agreement not found';
  end if;
  if v_app.status = 'accepted' and v_app.signed_at is not null then
    return v_app;
  end if;
  if v_app.status not in ('offered', 'invited') then
    raise exception 'There is nothing to sign yet';
  end if;
  v_invited := v_app.status = 'invited';
  select * into v_listing from public.marketplace_listings where id = v_app.listing_id;
  select * into v_profile from public.profiles where id = v_uid;
  select * into v_cp from public.creator_profiles where user_id = v_uid;

  if v_cp.birth_year is null then
    raise exception 'Add your age to your profile before you sign';
  end if;
  if extract(year from now())::int - v_cp.birth_year < greatest(18, v_listing.min_age) then
    raise exception 'This campaign is for creators % and older', greatest(18, v_listing.min_age);
  end if;
  if length(v_name) < 3 or position(' ' in v_name) = 0 then
    raise exception 'Type your full legal name to sign';
  end if;
  if v_app.contract_body is null or length(trim(v_app.contract_body)) < 40 then
    v_app.contract_body := public.creator_contract(v_listing, v_uid);
    v_app.contract_title := v_listing.contract_title;
    v_app.contract_version := v_listing.contract_version;
  end if;

  v_start := greatest(coalesce(v_app.start_date, current_date + v_listing.start_days), current_date);
  perform public.marketplace_join(v_app.company_id, v_uid);
  update public.marketplace_applications
    set status = 'accepted',
        contract_title = v_app.contract_title, contract_body = v_app.contract_body,
        contract_version = v_app.contract_version,
        contract_sha256 = encode(sha256(convert_to(v_app.contract_body, 'UTF8')), 'hex'),
        signed_name = v_name, signed_at = now(),
        decided_by = coalesce(decided_by, invited_by), decided_at = coalesce(decided_at, now()),
        start_date = v_start, updated_at = now()
    where id = v_app.id returning * into v_app;

  perform public.marketplace_notify(
    v_app.company_id, public.marketplace_manager_ids(v_app.company_id),
    case when v_invited then 'marketplace_invite_accepted' else 'marketplace_signed' end,
    coalesce(v_profile.full_name, 'A creator') || ' signed',
    'They start ' || to_char(v_start, 'FMMonth FMDD') || '.',
    'noni://manager/' || v_app.company_id || '/creator/' || v_uid,
    jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id, 'creator_id', v_uid)
  );
  return v_app;
end;
$$;

grant execute on function public.sign_creator_agreement(uuid, text) to authenticated;

-- 7. Withdraw: also turns an offer down ------------------------------------------

create or replace function public.withdraw_marketplace_application(p_id uuid)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.marketplace_applications;
begin
  update public.marketplace_applications
    set status = 'withdrawn', updated_at = now()
    where id = p_id and creator_id = auth.uid() and status in ('applied', 'invited', 'offered')
    returning * into v_app;
  if v_app.id is null then
    raise exception 'Nothing to withdraw';
  end if;
  return v_app;
end;
$$;

-- 8. Reads: an offer shows up to sign ----------------------------------------------

CREATE OR REPLACE FUNCTION public.creator_campaigns()
 RETURNS TABLE(kind text, company_id uuid, company_name text, logo_path text, listing_id uuid, title text, posts_per_week integer, application_id uuid, application_status text, invite_message text, is_active boolean, since timestamp with time zone, start_date date, to_fix integer, to_make integer, in_review integer, posted integer, unread integer, earned_month_cents bigint, earned_total_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_active uuid;
begin
  if v_uid is null then
    return;
  end if;
  select p.active_company_id into v_active from public.profiles p where p.id = v_uid;

  -- Active: one row per company the person creates for.
  return query
  select
    'active'::text,
    c.id, c.name, c.logo_path,
    l.id, coalesce(l.title, c.name), l.posts_per_week,
    a.id, a.status, null::text,
    c.id = v_active,
    cm.created_at,
    a.start_date,
    (select count(*)::int from public.assignments x
      where x.company_id = c.id and x.creator_id = v_uid and x.status = 'changes_requested'),
    (select count(*)::int from public.assignments x
      where x.company_id = c.id and x.creator_id = v_uid and x.status in ('assigned', 'recorded')
        and (x.scheduled_date is null or x.scheduled_date <= public.company_local_date(c.id))),
    (select count(*)::int from public.assignments x
      where x.company_id = c.id and x.creator_id = v_uid and x.status = 'submitted'),
    (select count(*)::int from public.assignments x
      where x.company_id = c.id and x.creator_id = v_uid and x.status = 'posted'),
    public.unread_inbox_count_for(c.id),
    (select coalesce(sum(w.amount_cents), 0)::bigint from public.wallet_ledger w
      where w.company_id = c.id and w.creator_id = v_uid and w.amount_cents > 0
        and w.created_at >= date_trunc('month', now())),
    (select coalesce(sum(w.amount_cents), 0)::bigint from public.wallet_ledger w
      where w.company_id = c.id and w.creator_id = v_uid and w.amount_cents > 0)
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  left join lateral (
    select y.* from public.marketplace_applications y
    where y.company_id = c.id and y.creator_id = v_uid and y.status = 'accepted'
    order by y.updated_at desc limit 1
  ) a on true
  left join public.marketplace_listings l on l.id = a.listing_id
  where cm.profile_id = v_uid
    and cm.removed_at is null
    and (cm.role = 'creator' or cm.can_create);

  -- Invited and applied: open applications at companies the person is not in yet.
  return query
  select
    y.status,
    c.id, c.name, c.logo_path,
    l.id, l.title, l.posts_per_week,
    y.id, y.status, y.invite_message,
    false,
    y.updated_at,
    y.start_date,
    0, 0, 0, 0, 0, 0::bigint, 0::bigint
  from public.marketplace_applications y
  join public.marketplace_listings l on l.id = y.listing_id
  join public.companies c on c.id = y.company_id
  where y.creator_id = v_uid
    and y.status in ('invited', 'applied', 'offered')
    and not exists (
      select 1 from public.company_members m
      where m.company_id = y.company_id and m.profile_id = v_uid and m.removed_at is null
    );

  -- Past: companies the person left or never got into, latest event per company.
  return query
  select distinct on (p.company_id)
    'past'::text,
    p.company_id, c.name, c.logo_path,
    p.listing_id, coalesce(p.title, c.name), p.posts_per_week,
    p.application_id, p.application_status, null::text,
    false,
    p.at,
    null::date,
    0,
    0,
    0,
    (select count(*)::int from public.assignments x
      where x.company_id = p.company_id and x.creator_id = v_uid and x.status = 'posted'),
    0,
    0::bigint,
    (select coalesce(sum(w.amount_cents), 0)::bigint from public.wallet_ledger w
      where w.company_id = p.company_id and w.creator_id = v_uid and w.amount_cents > 0)
  from (
    select cm.company_id, null::uuid as listing_id, null::text as title, null::int as posts_per_week,
      null::uuid as application_id, 'left'::text as application_status, cm.removed_at as at
    from public.company_members cm
    where cm.profile_id = v_uid and cm.removed_at is not null
      and (cm.role = 'creator' or cm.can_create)
    union all
    select y.company_id, l.id, l.title, l.posts_per_week, y.id, y.status, y.updated_at
    from public.marketplace_applications y
    join public.marketplace_listings l on l.id = y.listing_id
    where y.creator_id = v_uid and y.status in ('declined', 'withdrawn')
  ) p
  join public.companies c on c.id = p.company_id
  where not exists (
    select 1 from public.company_members m
    where m.company_id = p.company_id and m.profile_id = v_uid and m.removed_at is null
  )
  and not exists (
    select 1 from public.marketplace_applications y
    where y.company_id = p.company_id and y.creator_id = v_uid and y.status in ('invited', 'applied', 'offered')
  )
  order by p.company_id, p.at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_feed()
 RETURNS TABLE(id uuid, company_id uuid, company_name text, company_website text, status text, title text, tagline text, about text, requirements text, niches text[], platforms text[], posts_per_week integer, spots integer, spots_left integer, min_age integer, start_days integer, contract_title text, contract_body text, contract_version integer, opened_at timestamp with time zone, creator_count integer, is_member boolean, application_id uuid, application_status text, application_origin text, invite_message text, signed_at timestamp with time zone, start_date date, decision_note text, niche_overlap integer, logo_path text, brand_color text, posts_per_day_min integer, posts_per_day_max integer, video_post_cents integer, static_post_cents integer, cents_per_1k_views integer, view_pay_cap_cents integer, min_views integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    l.id, l.company_id, c.name, c.website,
    l.status, l.title, l.tagline, l.about, l.requirements,
    l.niches, l.platforms, l.posts_per_week, l.spots,
    case when l.spots is null then null
      else greatest(0, l.spots - (select count(*)::int from public.marketplace_applications x where x.listing_id = l.id and x.status in ('accepted', 'offered'))) end,
    l.min_age, l.start_days,
    -- An offer or an invite carries the creator's own agreement, ready to sign.
    coalesce(a.contract_title, l.contract_title),
    case when a.status in ('offered', 'invited', 'accepted') and a.contract_body is not null then a.contract_body else l.contract_body end,
    coalesce(a.contract_version, l.contract_version),
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
  order by (a.status in ('offered', 'invited')) desc nulls last, l.opened_at desc nulls last;
$function$;

-- The manager's Invited tab also holds accepted creators who have not signed yet.
CREATE OR REPLACE FUNCTION public.marketplace_creators(p_listing_id uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_niches text[] DEFAULT NULL::text[], p_gender text DEFAULT NULL::text, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_min_views bigint DEFAULT NULL::bigint, p_min_earned_cents bigint DEFAULT NULL::bigint, p_min_followers integer DEFAULT NULL::integer, p_experience text DEFAULT NULL::text, p_sort text DEFAULT 'match'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_out jsonb;
begin
  if auth.uid() is null or v_company_id is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;

  with rows as (
    select r.* from public.marketplace_creator_rows(v_company_id, p_listing_id) r
    where (case coalesce(p_scope, 'all')
        when 'applicants' then r.application_status = 'applied'
        when 'invited' then r.application_status in ('invited', 'offered')
        -- Browsing: people who are not on the team yet.
        else not r.is_member
      end)
      and (p_search is null or trim(p_search) = ''
        or r.full_name ilike '%' || trim(p_search) || '%'
        or r.tiktok ilike '%' || trim(leading '@' from trim(p_search)) || '%'
        or r.instagram ilike '%' || trim(leading '@' from trim(p_search)) || '%')
      and (p_niches is null or cardinality(p_niches) = 0 or r.niches && p_niches)
      and (p_gender is null or r.gender = p_gender)
      and (p_min_age is null or r.age >= p_min_age)
      and (p_max_age is null or r.age <= p_max_age)
      and (p_min_views is null or r.total_views >= p_min_views)
      and (p_min_earned_cents is null or r.total_earned_cents >= p_min_earned_cents)
      and (p_min_followers is null or coalesce(r.followers, 0) >= p_min_followers)
      and (p_experience is null or r.experience = p_experience)
  ),
  page as (
    select * from rows r
    order by
      case when p_sort = 'views' then r.total_views end desc nulls last,
      case when p_sort = 'earned' then r.total_earned_cents end desc nulls last,
      case when p_sort = 'followers' then r.followers end desc nulls last,
      case when p_sort = 'newest' then extract(epoch from coalesce(r.applied_at, r.joined_at)) end desc nulls last,
      r.match_score desc, r.total_views desc, r.joined_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 300)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'rows', coalesce((select jsonb_agg(to_jsonb(p)) from page p), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$function$;
