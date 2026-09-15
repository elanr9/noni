-- 091: Multi-company memberships.
--
-- Creators and campaign managers can belong to many companies at once.
-- company_members is the source of truth for who belongs where and as what.
-- profiles.company_id / profiles.role stay as the *active* context: every
-- existing RLS policy keeps reading current_company_id(), and the app switches
-- context with switch_active_company(). my_companies() returns every
-- membership plus a per-company attention summary for the switcher badges.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.companies add column if not exists logo_path text;

alter table public.company_members
  add column if not exists role text not null default 'campaign_manager',
  add column if not exists last_active_at timestamptz,
  add column if not exists removed_at timestamptz;

alter table public.company_members drop constraint if exists company_members_role_check;
alter table public.company_members
  add constraint company_members_role_check
  check (role in ('company_admin', 'campaign_manager', 'creator'));

create index if not exists company_members_profile_idx
  on public.company_members (profile_id) where removed_at is null;

-- Backfill: every profile with an active company is a member of it.
insert into public.company_members (company_id, profile_id, role, permissions)
select
  p.company_id,
  p.id,
  case when p.role = 'admin' then 'company_admin' else p.role end,
  case
    when p.role in ('admin', 'company_admin') then public.full_member_permissions()
    else public.default_member_permissions()
  end
from public.profiles p
where p.company_id is not null
on conflict (company_id, profile_id) do update
  set role = excluded.role;

-- ---------------------------------------------------------------------------
-- 2. Membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_member_of(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.company_members m
      where m.profile_id = auth.uid()
        and m.company_id = p_company_id
        and m.removed_at is null
    )
$$;

create or replace function public.member_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.company_members m
  where m.profile_id = auth.uid()
    and m.company_id = p_company_id
    and m.removed_at is null
$$;

create or replace function public.is_manager_of(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or public.member_role(p_company_id) in ('campaign_manager', 'company_admin')
$$;

-- True when p_profile_id belongs to p_company_id (any role).
create or replace function public.profile_in_company(p_profile_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members m
    where m.profile_id = p_profile_id
      and m.company_id = p_company_id
      and m.removed_at is null
  )
$$;

-- True when the caller and p_profile_id share at least one company.
create or replace function public.shares_company_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members mine
    join public.company_members theirs on theirs.company_id = mine.company_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = p_profile_id
      and mine.removed_at is null
      and theirs.removed_at is null
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Keep profiles.company_id and company_members consistent
-- ---------------------------------------------------------------------------

-- Legacy writers (edge functions, older RPCs) still set profiles.company_id
-- directly. Make sure a membership row always exists for the active company.
create or replace function public.ensure_membership_for_active_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    return new;
  end if;
  insert into public.company_members (company_id, profile_id, role, permissions)
  values (
    new.company_id,
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
  after insert or update of company_id on public.profiles
  for each row execute function public.ensure_membership_for_active_company();

-- When a member is removed from their active company, move them to another
-- company they still belong to (or none).
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
    where p.id = new.profile_id and p.company_id = new.company_id
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
        company_id = v_next.company_id,
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

drop trigger if exists company_members_reassign_active on public.company_members;
create trigger company_members_reassign_active
  after update of removed_at on public.company_members
  for each row execute function public.reassign_active_company_on_removal();

-- ---------------------------------------------------------------------------
-- 4. Switching
-- ---------------------------------------------------------------------------

create or replace function public.switch_active_company(p_company_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.company_members;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_member
  from public.company_members m
  where m.profile_id = v_uid
    and m.company_id = p_company_id
    and m.removed_at is null;

  if v_member.company_id is null then
    if public.is_platform_admin() then
      update public.profiles set company_id = p_company_id
        where id = v_uid
        returning * into v_profile;
      return v_profile;
    end if;
    raise exception 'not a member of this company' using errcode = '42501';
  end if;

  update public.profiles p
    set
      company_id = p_company_id,
      role = case when p.role = 'admin' then 'admin' else v_member.role end
    where p.id = v_uid
    returning * into v_profile;

  update public.company_members
    set last_active_at = now()
    where profile_id = v_uid and company_id = p_company_id;

  return v_profile;
end;
$$;

grant execute on function public.switch_active_company(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Company-scoped unread + attention
-- ---------------------------------------------------------------------------

-- Chat access is decided by membership in the chat's company, not the active
-- company, so cross-company badges can be computed in one call.
create or replace function public.can_access_manager_chat(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manager_chats c
    where c.id = p_chat_id
      and public.is_member_of(c.company_id)
      and (
        c.is_general
        or (
          c.kind = 'brief'
          and (
            public.is_manager_of(c.company_id)
            or exists (
              select 1 from public.assignments a
              where a.campaign_id = c.campaign_id
                and a.company_id = c.company_id
                and a.creator_id = auth.uid()
            )
          )
        )
        or (c.kind = 'dm' and auth.uid() in (c.user_a, c.user_b))
        or (
          c.kind = 'channel'
          and (
            (
              public.is_manager_of(c.company_id)
              and (
                public.member_role(c.company_id) = 'company_admin'
                or public.is_platform_admin()
                or c.created_by = auth.uid()
                or exists (
                  select 1 from public.manager_chat_members m
                  where m.chat_id = c.id and m.profile_id = auth.uid()
                )
              )
            )
            or (
              c.all_creators
              and (
                public.member_role(c.company_id) = 'creator'
                or exists (
                  select 1 from public.profiles p
                  where p.id = auth.uid() and p.can_create
                    and public.profile_in_company(p.id, c.company_id)
                )
              )
            )
          )
        )
      )
  )
$$;

create or replace function public.unread_inbox_count_for(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (
      select count(*)
      from public.messages m
      where m.company_id = p_company_id
        and m.author_id <> auth.uid()
        and (
          m.creator_id = auth.uid()
          or (m.author_id = m.creator_id and public.is_manager_of(p_company_id))
        )
        and m.created_at > coalesce(
          (select r.last_read_at from public.message_reads r
            where r.creator_id = m.creator_id and r.profile_id = auth.uid()),
          'epoch'::timestamptz)
    )
    +
    (
      select count(*)
      from public.manager_messages mm
      join public.manager_chats c on c.id = mm.chat_id
      where c.company_id = p_company_id
        and mm.author_id <> auth.uid()
        and public.can_access_manager_chat(c.id)
        and mm.created_at > coalesce(
          (select r.last_read_at from public.manager_chat_reads r
            where r.chat_id = mm.chat_id and r.profile_id = auth.uid()),
          'epoch'::timestamptz)
    )
  )::integer
$$;

create or replace function public.unread_inbox_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.unread_inbox_count_for(public.current_company_id())
$$;

-- Per-company "is anything waiting on me" summary for the caller.
-- Creators: work due today or overdue, changes requested, unread messages.
-- Managers: submissions to review, accounts to approve, creators behind, unread.
create or replace function public.company_attention(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.member_role(p_company_id);
  v_manager boolean := public.is_manager_of(p_company_id);
  v_unread integer := public.unread_inbox_count_for(p_company_id);
  v_due integer := 0;
  v_changes integer := 0;
  v_review integer := 0;
  v_accounts integer := 0;
  v_behind integer := 0;
  v_total integer;
begin
  if v_role = 'creator' then
    select count(*) into v_due
    from public.assignments a
    where a.company_id = p_company_id
      and a.creator_id = v_uid
      and a.status in ('assigned', 'recorded')
      and a.scheduled_date <= current_date;

    select count(*) into v_changes
    from public.assignments a
    where a.company_id = p_company_id
      and a.creator_id = v_uid
      and a.status = 'changes_requested';
  end if;

  if v_manager then
    select count(*) into v_review
    from public.assignments a
    where a.company_id = p_company_id
      and a.status = 'submitted';

    select count(*) into v_accounts
    from public.creator_accounts ca
    where ca.company_id = p_company_id
      and ca.status = 'pending';

    select count(distinct a.creator_id) into v_behind
    from public.assignments a
    where a.company_id = p_company_id
      and a.status in ('assigned', 'recorded')
      and a.scheduled_date < current_date;
  end if;

  v_total := v_due + v_changes + v_review + v_accounts + v_behind + v_unread;

  return jsonb_build_object(
    'due', v_due,
    'changes_requested', v_changes,
    'to_review', v_review,
    'accounts_pending', v_accounts,
    'creators_behind', v_behind,
    'unread_messages', v_unread,
    'total', v_total,
    'caught_up', v_total = 0
  );
end;
$$;

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
  order by (c.id = public.current_company_id()) desc, m.last_active_at desc nulls last, c.name asc
$$;

grant execute on function public.my_companies() to authenticated;
grant execute on function public.company_attention(uuid) to authenticated;
grant execute on function public.unread_inbox_count_for(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS: membership-aware reads
-- ---------------------------------------------------------------------------

-- Companies: any member can read the companies they belong to (switcher).
drop policy if exists "members read their companies" on public.companies;
create policy "members read their companies" on public.companies
  for select using (public.is_member_of(id));

-- company_members: members see the roster of every company they belong to.
drop policy if exists "members read company roster" on public.company_members;
create policy "members read company roster" on public.company_members
  for select using (public.is_member_of(company_id));

-- Managers holding invite_members manage creator memberships of the active company.
drop policy if exists "managers manage creator memberships" on public.company_members;
create policy "managers manage creator memberships" on public.company_members
  for update
  using (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and public.has_permission('invite_members')
    and role = 'creator'
  )
  with check (
    company_id = public.current_company_id()
    and role = 'creator'
  );

-- Profiles: readable when a company is shared, writable by managers of a
-- company the profile belongs to (not only the profile's active company).
drop policy if exists "shared company read profiles" on public.profiles;
create policy "shared company read profiles" on public.profiles
  for select using (public.shares_company_with(id));

drop policy if exists "admins write profiles" on public.profiles;
create policy "admins write profiles" on public.profiles
  for all
  using (
    public.is_campaign_manager()
    and public.profile_in_company(id, public.current_company_id())
  );

-- Company-scoped tables that checked profiles.company_id directly.
drop policy if exists brain_features_company_select on public.brain_features;
create policy brain_features_company_select on public.brain_features
  for select using (company_id = public.current_company_id());

drop policy if exists brief_templates_company_select on public.brief_templates;
create policy brief_templates_company_select on public.brief_templates
  for select using (company_id = public.current_company_id());

drop policy if exists feature_screenshots_company_select on public.feature_screenshots;
create policy feature_screenshots_company_select on public.feature_screenshots
  for select using (company_id = public.current_company_id());

-- DM partner must be a manager *of the active company* via membership.
drop policy if exists "insert company chats" on public.manager_chats;
create policy "insert company chats" on public.manager_chats
  for insert
  with check (
    company_id = public.current_company_id()
    and (
      (
        public.is_campaign_manager()
        and (
          kind = 'brief'
          or auth.uid() in (user_a, user_b)
          or (kind = 'channel' and created_by = auth.uid())
        )
      )
      or (
        kind = 'dm'
        and auth.uid() in (user_a, user_b)
        and exists (
          select 1 from public.company_members m
          where m.profile_id = case when user_a = auth.uid() then user_b else user_a end
            and m.company_id = public.current_company_id()
            and m.removed_at is null
            and m.role in ('campaign_manager', 'company_admin')
        )
      )
      or (
        kind = 'brief'
        and exists (
          select 1 from public.assignments a
          where a.campaign_id = manager_chats.campaign_id
            and a.company_id = public.current_company_id()
            and a.creator_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Roster view: creators / managers of a company via membership
-- ---------------------------------------------------------------------------

-- Drop-in replacement for `profiles where company_id = X and role = 'creator'`.
-- company_id here is the membership's company, not the profile's active one.
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
  p.company_id as active_company_id,
  p.role as active_role
from public.company_members m
join public.profiles p on p.id = m.profile_id
where m.removed_at is null;

grant select on public.company_roster to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Invites: accepting adds a membership, never clobbers another company
-- ---------------------------------------------------------------------------

-- Attach one accepted invite to a profile. Sets the active company only when
-- the profile has none yet. Returns true when the invite was consumed.
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

  if v_profile.company_id is null then
    update public.profiles
      set
        company_id = v_invite.company_id,
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

  insert into public.profiles (id, company_id, role, full_name, onboarded)
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
    insert into public.profiles (id, company_id, role, full_name, onboarded)
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

-- Managers of the active company may invite creators (and, with the flag,
-- managers) into it, and may see the pending invites for it.
drop policy if exists "managers manage invites for active company" on public.company_invites;
create policy "managers manage invites for active company" on public.company_invites
  for all
  using (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and public.has_permission('invite_members')
  )
  with check (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and public.has_permission('invite_members')
    and role = 'creator'
  );
