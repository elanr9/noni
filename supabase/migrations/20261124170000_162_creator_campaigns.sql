-- 162: every campaign a creator is in, has applied to, or has left, in one
-- read for the app's My campaigns view and the website's /campaigns page.
--
-- A campaign here is a company (company_members), with the marketplace
-- listing the creator came in through when there is one.
--   active   a live membership where the person creates
--   invited  a company asked; the creator has not signed yet
--   applied  signed and waiting on the company
--   past     left, removed, declined or withdrawn (one row per company)

create or replace function public.creator_campaigns()
returns table (
  kind text,
  company_id uuid,
  company_name text,
  logo_path text,
  listing_id uuid,
  title text,
  posts_per_week int,
  application_id uuid,
  application_status text,
  invite_message text,
  is_active boolean,
  since timestamptz,
  start_date date,
  to_fix int,
  to_make int,
  in_review int,
  posted int,
  unread int,
  earned_month_cents bigint,
  earned_total_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
    and y.status in ('invited', 'applied')
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
    where y.company_id = p.company_id and y.creator_id = v_uid and y.status in ('invited', 'applied')
  )
  order by p.company_id, p.at desc;
end;
$$;

revoke all on function public.creator_campaigns() from public, anon;
grant execute on function public.creator_campaigns() to authenticated;

-- A creator steps out of one campaign without touching the others. Managers
-- and owners leave through their own team screens, not this. The removal
-- triggers (091, 142) move the active company and clear unstarted work.
create or replace function public.leave_campaign(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.company_members
    set removed_at = now()
    where company_id = p_company_id and profile_id = v_uid
      and removed_at is null and role = 'creator';
  if not found then
    raise exception 'You are not a creator on this campaign';
  end if;
end;
$$;

revoke all on function public.leave_campaign(uuid) from public, anon;
grant execute on function public.leave_campaign(uuid) to authenticated;
