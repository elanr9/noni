-- 093: Active company context, membership-owned roles, cross-company summary.
--
-- Builds on 091 (memberships) and 092 (logo bucket).
--   * profiles.company_id becomes profiles.active_company_id. It must always
--     point at a company the profile is a member of (platform admins exempt).
--   * is_campaign_manager() / is_company_admin() read company_members.role for
--     the active company. profiles.role is kept only as the platform admin
--     marker plus a mirror of the active membership role for the client.
--   * set_active_company(uuid) is the only way to switch context.
--   * company_status_summary() and creator_earnings_by_company() read across
--     every membership so the switcher can show badges without switching.
--   * notifications table + feed, stamped with company_id and a deep_link.
--   * company_activity heartbeat table on the realtime publication so the
--     client can refresh the summary for companies other than the active one.

-- ---------------------------------------------------------------------------
-- 1. profiles.company_id -> profiles.active_company_id
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'company_id'
  ) then
    alter table public.profiles rename column company_id to active_company_id;
  end if;
end;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select active_company_id from public.profiles where id = auth.uid()
$$;

-- Membership row for the active company, or null.
create or replace function public.active_membership_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.company_members m
  join public.profiles p on p.id = m.profile_id
  where m.profile_id = auth.uid()
    and m.company_id = p.active_company_id
    and m.removed_at is null
$$;

create or replace function public.is_campaign_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or public.active_membership_role() in ('campaign_manager', 'company_admin')
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.active_membership_role() = 'company_admin'
$$;

create or replace function public."current_role"()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin() then 'admin'
    else public.active_membership_role()
  end
$$;

create or replace function public.can_create()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.active_membership_role() = 'creator'
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and can_create = true
    )
$$;

-- ---------------------------------------------------------------------------
-- 2. Triggers keeping active_company_id and company_members consistent
-- ---------------------------------------------------------------------------

-- New profiles (invite signup) get a membership for their first company.
create or replace function public.ensure_membership_for_active_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_company_id is null then
    return new;
  end if;
  insert into public.company_members (company_id, profile_id, role, permissions)
  values (
    new.active_company_id,
    new.id,
    case when new.role = 'admin' then 'company_admin' else new.role end,
    case
      when new.role in ('admin', 'company_admin') then public.full_member_permissions()
      else public.default_member_permissions()
    end
  )
  on conflict (company_id, profile_id) do update
    set removed_at = null;
  return new;
end;
$$;

drop trigger if exists profiles_ensure_membership on public.profiles;
create trigger profiles_ensure_membership
  after insert on public.profiles
  for each row execute function public.ensure_membership_for_active_company();

-- Switching context requires a membership. Platform admins are exempt.
create or replace function public.enforce_active_company_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_company_id is null
     or new.active_company_id is not distinct from old.active_company_id
     or new.role = 'admin' then
    return new;
  end if;
  if not exists (
    select 1 from public.company_members m
    where m.company_id = new.active_company_id
      and m.profile_id = new.id
      and m.removed_at is null
  ) then
    raise exception 'profile % is not a member of company %', new.id, new.active_company_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_active_membership on public.profiles;
create trigger profiles_enforce_active_membership
  before update of active_company_id on public.profiles
  for each row execute function public.enforce_active_company_membership();

create or replace function public.reassign_active_company_on_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.company_members;
begin
  if new.removed_at is null then
    return new;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.active_company_id = new.company_id
  ) then
    select * into v_next
    from public.company_members m
    where m.profile_id = new.profile_id
      and m.removed_at is null
      and m.company_id <> new.company_id
    order by m.last_active_at desc nulls last, m.created_at asc
    limit 1;

    update public.profiles p
      set
        active_company_id = v_next.company_id,
        role = case
          when p.role = 'admin' then 'admin'
          when v_next.company_id is null then p.role
          else v_next.role
        end
      where p.id = new.profile_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Switching
-- ---------------------------------------------------------------------------

create or replace function public.set_active_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.company_members;
  v_company public.companies;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_member
  from public.company_members m
  where m.profile_id = v_uid
    and m.company_id = p_company_id
    and m.removed_at is null;

  if v_member.company_id is null and not public.is_platform_admin() then
    raise exception 'not a member of this company' using errcode = '42501';
  end if;

  update public.profiles p
    set
      active_company_id = p_company_id,
      role = case
        when p.role = 'admin' then 'admin'
        when v_member.role is null then p.role
        else v_member.role
      end
    where p.id = v_uid;

  update public.company_members
    set last_active_at = now()
    where profile_id = v_uid and company_id = p_company_id;

  select * into v_company from public.companies where id = p_company_id;
  return v_company;
end;
$$;

grant execute on function public.set_active_company(uuid) to authenticated;

-- Kept for the in-flight client; delegates to set_active_company.
create or replace function public.switch_active_company(p_company_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  perform public.set_active_company(p_company_id);
  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Invites: membership first, active company only when none yet
-- ---------------------------------------------------------------------------

create or replace function public.apply_invite_membership(p_profile_id uuid, p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.company_invites;
  v_profile public.profiles;
begin
  select * into v_invite from public.company_invites where id = p_invite_id for update;
  if v_invite.id is null or v_invite.accepted_at is not null then
    return false;
  end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile.id is null then
    return false;
  end if;

  insert into public.company_members (company_id, profile_id, role, permissions)
  values (
    v_invite.company_id,
    p_profile_id,
    v_invite.role,
    case
      when v_invite.role = 'company_admin' then public.full_member_permissions()
      when v_invite.role = 'campaign_manager'
        then public.default_member_permissions() || coalesce(v_invite.permissions, '{}'::jsonb)
      else public.default_member_permissions()
    end
  )
  on conflict (company_id, profile_id) do update
    set
      role = excluded.role,
      permissions = excluded.permissions,
      removed_at = null;

  if v_profile.active_company_id is null then
    update public.profiles
      set
        active_company_id = v_invite.company_id,
        role = case when v_profile.role = 'admin' then 'admin' else v_invite.role end,
        onboarded = case
          when v_invite.role in ('campaign_manager', 'company_admin') then true
          else v_profile.onboarded
        end
      where id = p_profile_id;
  end if;

  update public.company_invites set accepted_at = now() where id = v_invite.id;
  return true;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_first record;
  v_invite record;
begin
  v_email := lower(coalesce(
    new.email,
    new.raw_user_meta_data ->> 'email',
    ''
  ));

  select i.id, i.company_id, i.role into v_first
  from public.company_invites i
  where lower(i.email) = v_email
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_first.id is null then
    return new;
  end if;

  insert into public.profiles (id, active_company_id, role, full_name, onboarded)
  values (
    new.id,
    v_first.company_id,
    v_first.role,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    v_first.role in ('campaign_manager', 'company_admin')
  )
  on conflict (id) do nothing;

  for v_invite in
    select i.id
    from public.company_invites i
    where lower(i.email) = v_email
      and i.accepted_at is null
      and i.expires_at > now()
    order by i.created_at desc
  loop
    perform public.apply_invite_membership(new.id, v_invite.id);
  end loop;

  return new;
end;
$$;

create or replace function public.claim_pending_invite()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_first record;
  v_invite record;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(coalesce(u.email, u.raw_user_meta_data ->> 'email', ''))
    into v_email
    from auth.users u
    where u.id = v_uid;

  select * into v_profile from public.profiles where id = v_uid;

  select i.id, i.company_id, i.role into v_first
  from public.company_invites i
  where lower(i.email) = v_email
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_first.id is null then
    return v_profile;
  end if;

  if v_profile.id is null then
    insert into public.profiles (id, active_company_id, role, full_name, onboarded)
    values (
      v_uid,
      v_first.company_id,
      v_first.role,
      null,
      v_first.role in ('campaign_manager', 'company_admin')
    );
  end if;

  for v_invite in
    select i.id
    from public.company_invites i
    where lower(i.email) = v_email
      and i.accepted_at is null
      and i.expires_at > now()
    order by i.created_at desc
  loop
    perform public.apply_invite_membership(v_uid, v_invite.id);
  end loop;

  select * into v_profile from public.profiles where id = v_uid;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Roster view (column rename only)
-- ---------------------------------------------------------------------------

create or replace view public.company_roster
with (security_invoker = true)
as
select
  m.company_id,
  m.role as member_role,
  m.permissions as member_permissions,
  m.created_at as joined_at,
  m.last_active_at,
  p.id,
  p.full_name,
  p.avatar_path,
  p.expo_push_token,
  p.onboarded,
  p.created_at,
  p.upload_post_profile,
  p.has_credential,
  p.has_scar_tissue,
  p.has_transformation,
  p.can_film_with_second_person,
  p.lives_the_identity,
  p.on_camera_comfortable,
  p.baseline_primary_signal,
  p.baseline_updated_at,
  p.credential_line,
  p.bio_facts,
  p.script_mode,
  p.available,
  p.birthday,
  p.phone,
  p.onboarding_answers,
  p.can_create,
  p.active_company_id,
  p.role as active_role
from public.company_members m
join public.profiles p on p.id = m.profile_id
where m.removed_at is null;

-- ---------------------------------------------------------------------------
-- 6. Logo bucket: allow svg (web upload spec)
-- ---------------------------------------------------------------------------

update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  where id = 'company-logos';

-- ---------------------------------------------------------------------------
-- 7. my_companies(): active first, then name
-- ---------------------------------------------------------------------------

create or replace function public.my_companies()
returns table (
  company_id uuid,
  name text,
  slug text,
  logo_path text,
  role text,
  permissions jsonb,
  is_active boolean,
  joined_at timestamptz,
  last_active_at timestamptz,
  attention jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.slug,
    c.logo_path,
    m.role,
    m.permissions,
    c.id = public.current_company_id(),
    m.created_at,
    m.last_active_at,
    public.company_attention(c.id)
  from public.company_members m
  join public.companies c on c.id = m.company_id
  where m.profile_id = auth.uid()
    and m.removed_at is null
  order by (c.id = public.current_company_id()) desc, c.name asc
$$;

-- ---------------------------------------------------------------------------
-- 8. company_status_summary(): one row per membership, any active company
-- ---------------------------------------------------------------------------

create or replace function public.company_local_date(p_company_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    nullif(trim(c.settings ->> 'timezone'), ''),
    'America/Chicago'
  ))::date
  from public.companies c
  where c.id = p_company_id
$$;

create or replace function public.company_status_summary()
returns table (
  company_id uuid,
  name text,
  logo_path text,
  role text,
  is_active boolean,
  waiting integer,
  line text,
  fix integer,
  unread integer,
  shoot integer,
  review integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active uuid := public.current_company_id();
  m record;
  v_fix integer;
  v_unread integer;
  v_shoot integer;
  v_review integer;
  v_parts text[];
begin
  for m in
    select c.id, c.name, c.logo_path, cm.role
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.profile_id = v_uid
      and cm.removed_at is null
    order by (c.id = v_active) desc, c.name asc
  loop
    v_fix := 0;
    v_shoot := 0;
    v_review := 0;
    v_unread := public.unread_inbox_count_for(m.id);
    v_parts := '{}';

    if m.role = 'creator' then
      select count(*) into v_fix
      from public.assignments a
      where a.company_id = m.id
        and a.creator_id = v_uid
        and a.status = 'changes_requested';

      select count(*) into v_shoot
      from public.assignments a
      where a.company_id = m.id
        and a.creator_id = v_uid
        and a.status = 'assigned'
        and a.scheduled_date = public.company_local_date(m.id);

      if v_fix > 0 then v_parts := v_parts || (v_fix || ' to fix'); end if;
      if v_unread > 0 then v_parts := v_parts || (v_unread || ' unread'); end if;
      if cardinality(v_parts) = 0 then v_parts := array['Caught up']; end if;
      if v_shoot > 0 then v_parts := v_parts || (v_shoot || ' to shoot'); end if;
    else
      select
        (select count(*) from public.assignments a
          where a.company_id = m.id and a.status = 'submitted')
        + (select count(*) from public.assignments a
          where a.company_id = m.id
            and a.music_marked_by_creator_at is not null
            and a.music_approved_at is null
            and a.status in ('approved', 'posted'))
        + (select count(*) from public.creator_accounts ca
          where ca.company_id = m.id and ca.status = 'pending')
      into v_review;

      if v_review > 0 then v_parts := v_parts || (v_review || ' to review'); end if;
      if v_unread > 0 then v_parts := v_parts || (v_unread || ' unread'); end if;
      if cardinality(v_parts) = 0 then v_parts := array['Caught up']; end if;
    end if;

    company_id := m.id;
    name := m.name;
    logo_path := m.logo_path;
    role := m.role;
    is_active := m.id = v_active;
    fix := v_fix;
    unread := v_unread;
    shoot := v_shoot;
    review := v_review;
    waiting := v_fix + v_unread + v_review;
    line := array_to_string(v_parts, ', ');
    return next;
  end loop;
end;
$$;

grant execute on function public.company_status_summary() to authenticated;
grant execute on function public.company_local_date(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. creator_earnings_by_company()
-- ---------------------------------------------------------------------------

create or replace function public.creator_earnings_by_company()
returns table (
  company_id uuid,
  name text,
  logo_path text,
  earned_cents bigint,
  available_cents integer,
  pending_cents integer,
  is_total boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with per_company as (
    select
      c.id,
      c.name,
      c.logo_path,
      coalesce((
        select sum(l.amount_cents)
        from public.wallet_ledger l
        where l.company_id = c.id
          and l.creator_id = auth.uid()
          and l.kind in ('bounty_credit', 'streak_bonus', 'adjustment')
      ), 0)::bigint as earned_cents,
      coalesce(w.available_cents, 0) as available_cents,
      coalesce(w.pending_cents, 0) as pending_cents
    from public.company_members m
    join public.companies c on c.id = m.company_id
    left join public.creator_wallets w
      on w.company_id = c.id and w.creator_id = auth.uid()
    where m.profile_id = auth.uid()
      and m.removed_at is null
      and m.role = 'creator'
  )
  select id, name, logo_path, earned_cents, available_cents, pending_cents, false as is_total
  from per_company
  union all
  select
    null::uuid,
    'Total',
    null::text,
    coalesce(sum(earned_cents), 0)::bigint,
    coalesce(sum(available_cents), 0)::integer,
    coalesce(sum(pending_cents), 0)::integer,
    true
  from per_company
  order by 7 asc, 2 asc
$$;

grant execute on function public.creator_earnings_by_company() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Notifications: stored per recipient, stamped with company + deep link
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event text not null,
  title text not null,
  body text not null,
  deep_link text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_created_idx
  on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications
  for select using (profile_id = auth.uid());

drop policy if exists "mark own notifications" on public.notifications;
create policy "mark own notifications" on public.notifications
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function public.notifications_feed(p_limit integer default 50, p_before timestamptz default null)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  company_logo_path text,
  event text,
  title text,
  body text,
  deep_link text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.company_id,
    c.name,
    c.logo_path,
    n.event,
    n.title,
    n.body,
    n.deep_link,
    n.data,
    n.read_at,
    n.created_at
  from public.notifications n
  join public.companies c on c.id = n.company_id
  join public.company_members m
    on m.company_id = n.company_id
   and m.profile_id = auth.uid()
   and m.removed_at is null
  where n.profile_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
    set read_at = coalesce(read_at, now())
    where id = p_id and profile_id = auth.uid()
$$;

grant execute on function public.notifications_feed(integer, timestamptz) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Realtime heartbeat for companies other than the active one
-- ---------------------------------------------------------------------------

-- Row-level reads on assignments / messages are scoped to the active company,
-- so realtime for other companies never reaches the client. This one-row-per-
-- company table is readable by every member; a change means "refetch
-- company_status_summary()".
create table if not exists public.company_activity (
  company_id uuid primary key references public.companies (id) on delete cascade,
  kind text not null,
  bumped_at timestamptz not null default now()
);

alter table public.company_activity enable row level security;

drop policy if exists "members read company activity" on public.company_activity;
create policy "members read company activity" on public.company_activity
  for select using (public.is_member_of(company_id));

create or replace function public.bump_company_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    return new;
  end if;
  insert into public.company_activity (company_id, kind, bumped_at)
  values (new.company_id, tg_table_name, now())
  on conflict (company_id) do update
    set kind = excluded.kind, bumped_at = now();
  return new;
end;
$$;

drop trigger if exists assignments_bump_activity on public.assignments;
create trigger assignments_bump_activity
  after insert or update of status, music_marked_by_creator_at, music_approved_at on public.assignments
  for each row execute function public.bump_company_activity();

drop trigger if exists messages_bump_activity on public.messages;
create trigger messages_bump_activity
  after insert on public.messages
  for each row execute function public.bump_company_activity();

drop trigger if exists manager_messages_bump_activity on public.manager_messages;
create trigger manager_messages_bump_activity
  after insert on public.manager_messages
  for each row execute function public.bump_company_activity();

drop trigger if exists creator_accounts_bump_activity on public.creator_accounts;
create trigger creator_accounts_bump_activity
  after insert or update of status on public.creator_accounts
  for each row execute function public.bump_company_activity();

drop trigger if exists notifications_bump_activity on public.notifications;
create trigger notifications_bump_activity
  after insert on public.notifications
  for each row execute function public.bump_company_activity();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'company_activity'
  ) then
    alter publication supabase_realtime add table public.company_activity;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
