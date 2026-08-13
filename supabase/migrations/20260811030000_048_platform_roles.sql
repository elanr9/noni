-- Noni migration 048: platform roles.
-- Company operators become role campaign_manager. Role admin is reserved for
-- the single Noni platform ops account (founders@usenoni.app), which lives on
-- a seeded Noni Platform company so profiles.company_id stays NOT NULL.
-- Every policy that used is_admin() is rewritten in this migration so that
-- tenant power now means campaign_manager, and is_admin() itself becomes a
-- deprecated alias for is_campaign_manager() to cover old function bodies.

-- 1. Role rename -------------------------------------------------------------

alter table public.profiles drop constraint profiles_role_check;

update public.profiles set role = 'campaign_manager' where role = 'admin';

-- Seed the platform company and promote founders@usenoni.app.
insert into public.companies (name, slug)
values ('Noni Platform', 'noni-platform')
on conflict (slug) do nothing;

do $$
declare
  v_user uuid;
  v_company uuid;
begin
  select id into v_company from public.companies where slug = 'noni-platform';
  select id into v_user from auth.users where lower(email) = 'founders@usenoni.app';
  if v_user is not null then
    insert into public.profiles (id, company_id, role, full_name, onboarded)
    values (v_user, v_company, 'admin', 'Noni Platform', true)
    on conflict (id) do update
      set role = 'admin',
          company_id = excluded.company_id,
          onboarded = true;
  end if;
end;
$$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'campaign_manager', 'creator'));

-- At most one platform admin, ever.
create unique index profiles_single_platform_admin
  on public.profiles ((role))
  where role = 'admin';

-- 2. Role helpers ------------------------------------------------------------

create or replace function public.is_campaign_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'campaign_manager'
  )
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

-- 3. Rewrite every policy that referenced is_admin() -------------------------
-- Tenant power moves verbatim from is_admin() to is_campaign_manager().
-- Covers public tables and the storage.objects policies alike.

do $$
declare
  p record;
  v_qual text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where coalesce(qual, '') like '%is_admin()%'
       or coalesce(with_check, '') like '%is_admin()%'
  loop
    v_qual := replace(
      replace(p.qual, 'public.is_admin()', 'public.is_campaign_manager()'),
      'is_admin()', 'is_campaign_manager()');
    v_check := replace(
      replace(p.with_check, 'public.is_admin()', 'public.is_campaign_manager()'),
      'is_admin()', 'is_campaign_manager()');

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.policyname, p.schemaname, p.tablename,
      p.permissive, p.cmd, array_to_string(p.roles, ', '));
    if v_qual is not null then
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;
    execute v_sql;
  end loop;
end;
$$;

-- Deprecated alias so pre-048 function bodies keep their tenant semantics.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_campaign_manager()
$$;

comment on function public.is_admin() is
  'Deprecated: alias for is_campaign_manager(). Platform checks use is_platform_admin().';

-- 4. Platform admin RLS ------------------------------------------------------
-- Cross-tenant reads plus company provisioning. Profile writes for invite
-- acceptance stay in the edge function (service role), not client RLS.

create policy "platform admin read companies" on public.companies
  for select using (public.is_platform_admin());

create policy "platform admin insert companies" on public.companies
  for insert with check (public.is_platform_admin());

create policy "platform admin update companies" on public.companies
  for update using (public.is_platform_admin());

create policy "platform admin read profiles" on public.profiles
  for select using (public.is_platform_admin());

-- 5. Campaign manager invites ------------------------------------------------

create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  email text not null,
  role text not null default 'campaign_manager' check (role = 'campaign_manager'),
  token text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

alter table public.company_invites enable row level security;

-- Platform admin manages invites from /ops; invitees accept through the
-- invite-campaign-manager edge function (service role), never via RLS.
create policy "platform admin manages invites" on public.company_invites
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
