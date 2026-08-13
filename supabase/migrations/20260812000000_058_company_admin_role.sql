-- Noni migration 058: company admin layer.
-- New hierarchy: the platform admin (role 'admin', /ops on noni-web) creates a
-- company and emails a company_admin invite. The company admin is web-only and
-- owns billing, budget, brand brain, features, account template, publish time,
-- and the team: inviting campaign managers and toggling their permissions.
-- Campaign managers work in the iOS app and start with every permission toggle
-- OFF; the company admin grants flags per manager.

-- 1. Role: company_admin, exactly one per company ------------------------------

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'company_admin', 'campaign_manager', 'creator'));

create unique index profiles_single_company_admin
  on public.profiles (company_id)
  where role = 'company_admin';

-- 2. Role helpers ---------------------------------------------------------------

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'company_admin'
  )
$$;

-- Tenant power now spans campaign managers, the company admin (web), and the
-- platform admin: every campaign-manager RLS policy applies to all three.
create or replace function public.is_campaign_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('campaign_manager', 'company_admin', 'admin')
  )
$$;

-- 3. Permissions ------------------------------------------------------------------

-- The company admin implicitly holds every permission in their company, same
-- as the platform admin holds them everywhere. RLS already scopes rows to
-- current_company_id(), so the role check is enough.
create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or public.is_company_admin()
    or coalesce(
      (
        select (cm.permissions ->> p_key)::boolean
        from public.company_members cm
        where cm.profile_id = auth.uid()
          and cm.company_id = public.current_company_id()
      ),
      false
    )
$$;

-- Invited campaign managers start with nothing; the company admin toggles
-- flags from the web dashboard.
create or replace function public.default_member_permissions()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'invite_members', false,
    'edit_account_template', false,
    'manage_brand', false,
    'manage_features', false,
    'manage_billing', false,
    'manage_publish_time', false,
    'regenerate_company_code', false
  )
$$;

-- 4. Role-aware invites with preset permissions ------------------------------------

alter table public.company_invites drop constraint company_invites_role_check;
alter table public.company_invites
  add constraint company_invites_role_check
  check (role in ('company_admin', 'campaign_manager'));

-- Preset toggles chosen by the admin at invite time; copied to the member row
-- on signup. Empty means every toggle off.
alter table public.company_invites
  add column permissions jsonb not null default '{}'::jsonb;

-- 5. Company admin manages the team --------------------------------------------------

create policy "company admin manages members" on public.company_members
  for all
  using (public.is_company_admin() and company_id = public.current_company_id())
  with check (public.is_company_admin() and company_id = public.current_company_id());

-- Read for the pending-invites list plus delete for revoking; creating an
-- invite stays in the invite-campaign-manager edge function so the email
-- always goes out.
create policy "company admin manages own invites" on public.company_invites
  for all
  using (public.is_company_admin() and company_id = public.current_company_id())
  with check (public.is_company_admin() and company_id = public.current_company_id());

-- Team page needs member names; company admin reads profiles in their company.
create policy "company admin reads company profiles" on public.profiles
  for select using (
    public.is_company_admin() and company_id = public.current_company_id()
  );

-- 6. Billing gates move from blanket manager power to manage_billing -----------------
-- has_permission() lets the company admin through implicitly; campaign managers
-- need the toggle.

drop policy "admins select company billing" on public.company_billing;
create policy "billing reads need manage_billing" on public.company_billing
  for select using (
    company_id = public.current_company_id() and public.has_permission('manage_billing')
  );

drop policy "admins update company billing" on public.company_billing;
create policy "billing writes need manage_billing" on public.company_billing
  for update using (
    company_id = public.current_company_id() and public.has_permission('manage_billing')
  );

create policy "billing inserts need manage_billing" on public.company_billing
  for insert with check (
    company_id = public.current_company_id() and public.has_permission('manage_billing')
  );

drop policy "admins select payout runs" on public.company_payout_runs;
create policy "payout run reads need manage_billing" on public.company_payout_runs
  for select using (
    company_id = public.current_company_id() and public.has_permission('manage_billing')
  );

-- 7. Join code regeneration: platform admin, or company staff with the toggle --------

create or replace function public.regenerate_company_join_code(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not (
    public.is_platform_admin()
    or (
      p_company_id = public.current_company_id()
      and public.has_permission('regenerate_company_code')
    )
  ) then
    raise exception 'Not allowed to regenerate this company''s code';
  end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (
      select 1 from public.companies where join_code = v_code
    );
  end loop;

  update public.companies set join_code = v_code where id = p_company_id;
  if not found then
    raise exception 'Company not found';
  end if;

  return v_code;
end;
$$;

create or replace function public.enforce_company_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role and SQL jobs carry no auth uid; clients are RLS-scoped.
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  if new.settings -> 'account_template' is distinct from old.settings -> 'account_template'
     and not public.has_permission('edit_account_template') then
    raise exception 'edit_account_template permission required';
  end if;
  if new.settings -> 'publish' is distinct from old.settings -> 'publish'
     and not public.has_permission('manage_publish_time') then
    raise exception 'manage_publish_time permission required';
  end if;
  if new.join_code is distinct from old.join_code
     and not public.has_permission('regenerate_company_code') then
    raise exception 'regenerate_company_code permission required';
  end if;
  return new;
end;
$$;

-- 8. Invite-aware signup handles both invite roles ------------------------------------
-- Company admins onboard on the web (usenoni.app); campaign managers onboard in
-- the app. Both start not onboarded. Manager permissions copy the invite's
-- preset toggles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  select i.id, i.company_id, i.role, i.permissions into v_invite
  from public.company_invites i
  where lower(i.email) = lower(coalesce(new.email, ''))
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_invite.id is not null then
    insert into public.profiles (id, company_id, role, full_name, onboarded)
    values (
      new.id,
      v_invite.company_id,
      v_invite.role,
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      false
    )
    on conflict (id) do nothing;

    insert into public.company_members (company_id, profile_id, permissions)
    values (
      v_invite.company_id,
      new.id,
      case
        when v_invite.role = 'company_admin' then public.full_member_permissions()
        else public.default_member_permissions() || coalesce(v_invite.permissions, '{}'::jsonb)
      end
    )
    on conflict (company_id, profile_id) do nothing;

    update public.company_invites
      set accepted_at = now()
      where id = v_invite.id;

    return new;
  end if;

  -- Everyone else starts unattached; creators join a company by code.
  insert into public.profiles (id, company_id, role, full_name, onboarded)
  values (
    new.id,
    null,
    'creator',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
