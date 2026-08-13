-- Noni migration 056: per-member company permissions + codeless signup removal.
-- company_members holds a jsonb permission map per campaign manager. The
-- platform admin (role 'admin') implicitly has every permission everywhere.
-- New signups no longer land in the oldest company: profiles.company_id goes
-- nullable and creators attach themselves via join_company_by_code.

-- 1. company_members ----------------------------------------------------------

create table public.company_members (
  company_id uuid not null references public.companies,
  profile_id uuid not null references public.profiles on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (company_id, profile_id)
);

alter table public.company_members enable row level security;

create policy "read own membership" on public.company_members
  for select using (profile_id = auth.uid());

create policy "platform admin manages members" on public.company_members
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Every permission granted; used for backfill and for invited managers.
create or replace function public.full_member_permissions()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'invite_members', true,
    'edit_account_template', true,
    'manage_brand', true,
    'manage_features', true,
    'manage_billing', true,
    'manage_publish_time', true
  )
$$;

-- 2. Backfill: existing campaign managers and the platform admin's own company

insert into public.company_members (company_id, profile_id, permissions)
select p.company_id, p.id, public.full_member_permissions()
from public.profiles p
where p.role in ('campaign_manager', 'admin')
  and p.company_id is not null
on conflict (company_id, profile_id) do nothing;

-- 3. has_permission ------------------------------------------------------------

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
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

-- 4. Permission-gated writes ---------------------------------------------------

drop policy "admins write brand" on public.brand_profiles;
create policy "brand writes need manage_brand" on public.brand_profiles
  for all
  using (company_id = public.current_company_id() and public.has_permission('manage_brand'));

drop policy "admins write brand docs" on public.brand_docs;
create policy "brand doc writes need manage_brand" on public.brand_docs
  for all
  using (company_id = public.current_company_id() and public.has_permission('manage_brand'));

drop policy "admins write product features" on public.product_features;
create policy "feature writes need manage_features" on public.product_features
  for all
  using (company_id = public.current_company_id() and public.has_permission('manage_features'));

-- companies: RLS keeps the row-level campaign manager gate; a trigger applies
-- per-field permissions since the account template and publish config share
-- the settings column.
drop policy "admins update company" on public.companies;
create policy "campaign managers update company" on public.companies
  for update
  using (id = public.current_company_id() and public.is_campaign_manager());

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
  if (to_jsonb(new) - 'settings') is distinct from (to_jsonb(old) - 'settings') then
    raise exception 'Platform ops only';
  end if;
  return new;
end;
$$;

create trigger companies_enforce_permissions
  before update on public.companies
  for each row execute function public.enforce_company_update_permissions();

-- 5. No more silent default company ---------------------------------------------

alter table public.profiles alter column company_id drop not null;

-- Pre-join creators have no company, so the same-company read policy cannot
-- see their own row; they still need their profile to finish onboarding.
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_invite_company uuid;
begin
  select i.id, i.company_id into v_invite_id, v_invite_company
  from public.company_invites i
  where lower(i.email) = lower(coalesce(new.email, ''))
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_invite_id is not null then
    insert into public.profiles (id, company_id, role, full_name, onboarded)
    values (
      new.id,
      v_invite_company,
      'campaign_manager',
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      false
    )
    on conflict (id) do nothing;

    insert into public.company_members (company_id, profile_id, permissions)
    values (v_invite_company, new.id, public.full_member_permissions())
    on conflict (company_id, profile_id) do nothing;

    update public.company_invites
      set accepted_at = now()
      where id = v_invite_id;

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
