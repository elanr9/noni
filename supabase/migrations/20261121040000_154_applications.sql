-- 154: Apply, then get approved.
--
-- Noni's front door used to be an invite (migration 143 refused to create a
-- login without one). Companies and creators now apply on the website: they
-- sign in with Google, answer a short chat (edge function apply-chat), and
-- wait in review until the platform admin approves them. Email invites keep
-- working exactly as before; an invited person never sees an application.
--
-- applications      one per person per kind (company | creator). The chat
--                   and the answers live here because an applicant has no
--                   profile and no company yet.
-- creator_profiles  a creator's resume, Noni-wide rather than per company:
--                   main Instagram and TikTok, experience, niches, links to
--                   their best videos. Filled by the apply chat, edited later.
-- approve_application / reject_application   platform admin only. Approving
--                   a company creates the company, makes the applicant its
--                   admin and counts setup as done (the chat already asked
--                   the basics). Approving a creator gives them a creator
--                   profile with no company yet; they join companies later.

-- ---------------------------------------------------------------------------
-- 1. Signup is open again; access is what is gated
-- ---------------------------------------------------------------------------

-- The hook stays enabled in auth settings but now lets every new login
-- through. A login with no invite gets no profile (handle_new_user), so it
-- can do nothing until an application is approved.
create or replace function public.hook_require_invite(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return '{}'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Applications
-- ---------------------------------------------------------------------------

create table if not exists public.applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  kind           text not null check (kind in ('company', 'creator')),
  status         text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected')),
  email          text,
  full_name      text,
  -- { messages: [{ role, text, slot }], answered: string[], followups: {} }
  chat           jsonb not null default '{}'::jsonb,
  -- slot key -> answer value, the source the approval reads from
  answers        jsonb not null default '{}'::jsonb,
  submitted_at   timestamptz,
  decided_at     timestamptz,
  decided_by     uuid references public.profiles,
  decision_note  text,
  company_id     uuid references public.companies on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, kind)
);

create index if not exists applications_status_idx
  on public.applications (status, submitted_at desc);

alter table public.applications enable row level security;

drop policy if exists applications_read_own on public.applications;
create policy applications_read_own on public.applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Writes go through apply-chat (service role) and the RPCs below.

-- ---------------------------------------------------------------------------
-- 3. Creator resume
-- ---------------------------------------------------------------------------

create table if not exists public.creator_profiles (
  user_id          uuid primary key references auth.users on delete cascade,
  instagram        text,
  tiktok           text,
  -- 'pro' paid UGC before, 'some' a little, 'new' never
  experience       text check (experience in ('pro', 'some', 'new')),
  campaigns_done   text,
  best_campaign    text,
  niches           text[] not null default '{}',
  styles           text[] not null default '{}',
  on_camera        text,
  weekly_capacity  text,
  -- [{ url, note? }] links to their best videos
  portfolio        jsonb not null default '[]'::jsonb,
  bio              text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.creator_profiles enable row level security;

drop policy if exists creator_profiles_read on public.creator_profiles;
create policy creator_profiles_read on public.creator_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin()
    -- Companies see the resume of creators who work with them.
    or exists (
      select 1 from public.company_members m
      where m.profile_id = creator_profiles.user_id
        and m.removed_at is null
        and public.is_member_of(m.company_id)
    )
  );

drop policy if exists creator_profiles_write_own on public.creator_profiles;
create policy creator_profiles_write_own on public.creator_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Decisions
-- ---------------------------------------------------------------------------

create or replace function public.unique_company_slug(p_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_root text := coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), ''), 'company');
  v_try text;
begin
  for i in 1..200 loop
    v_try := case when i = 1 then v_root else v_root || '-' || i end;
    if not exists (select 1 from public.companies where slug = v_try) then
      return v_try;
    end if;
  end loop;
  return v_root || '-' || substr(gen_random_uuid()::text, 1, 8);
end;
$$;

create or replace function public.approve_application(p_id uuid, p_note text default null)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications;
  v_a jsonb;
  v_company_id uuid;
  v_profile public.profiles;
  v_name text;
  v_runs text;
begin
  if not public.is_platform_admin() and auth.uid() is not null then
    raise exception 'platform admin only' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_id for update;
  if v_app.id is null then
    raise exception 'application not found';
  end if;
  if v_app.status = 'approved' then
    return v_app;
  end if;
  if v_app.status = 'draft' then
    raise exception 'application is not finished yet';
  end if;

  v_a := v_app.answers;
  select * into v_profile from public.profiles where id = v_app.user_id;

  if v_app.kind = 'company' then
    v_name := coalesce(nullif(trim(v_a ->> 'company_name'), ''), 'New company');
    v_runs := v_a ->> 'runs_campaigns';
    insert into public.companies (
      name, slug, website, intake, admin_role, manager_count, self_is_manager, onboarded_at
    ) values (
      v_name,
      public.unique_company_slug(v_name),
      nullif(trim(v_a ->> 'website'), ''),
      jsonb_strip_nulls(jsonb_build_object(
        'goal', v_a ->> 'goal',
        'platforms', v_a -> 'platforms',
        'creators_wanted', v_a ->> 'creators_wanted',
        'monthly_budget', v_a ->> 'monthly_budget',
        'launch', v_a ->> 'launch',
        'campaigns_run_by', v_runs,
        'source', 'application'
      )),
      v_a ->> 'role',
      case when v_runs = 'noni' then 0 else 1 end,
      v_runs = 'me',
      now()
    )
    returning id into v_company_id;

    if v_profile.id is null then
      -- profiles_ensure_membership adds the company_admin membership.
      insert into public.profiles (id, active_company_id, role, full_name, onboarded)
      values (v_app.user_id, v_company_id, 'company_admin', nullif(trim(v_app.full_name), ''), true);
    else
      insert into public.company_members (company_id, profile_id, role, permissions)
      values (v_company_id, v_app.user_id, 'company_admin', public.full_member_permissions())
      on conflict (company_id, profile_id) do update
        set role = 'company_admin', removed_at = null, permissions = public.full_member_permissions();
      if v_profile.role <> 'admin' then
        update public.profiles
          set active_company_id = v_company_id, role = 'company_admin', onboarded = true
          where id = v_app.user_id;
      end if;
    end if;
  else
    if v_profile.id is null then
      insert into public.profiles (id, active_company_id, role, full_name, onboarded)
      values (v_app.user_id, null, 'creator', nullif(trim(v_app.full_name), ''), true);
    end if;
  end if;

  update public.applications
    set status = 'approved',
        decided_at = now(),
        decided_by = auth.uid(),
        decision_note = p_note,
        company_id = v_company_id,
        updated_at = now()
    where id = p_id
    returning * into v_app;
  return v_app;
end;
$$;

create or replace function public.reject_application(p_id uuid, p_note text default null)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications;
begin
  if not public.is_platform_admin() and auth.uid() is not null then
    raise exception 'platform admin only' using errcode = '42501';
  end if;
  update public.applications
    set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
        decision_note = p_note, updated_at = now()
    where id = p_id and status <> 'approved'
    returning * into v_app;
  if v_app.id is null then
    raise exception 'application not found or already approved';
  end if;
  return v_app;
end;
$$;

revoke execute on function public.approve_application(uuid, text) from public, anon;
revoke execute on function public.reject_application(uuid, text) from public, anon;
grant execute on function public.approve_application(uuid, text) to authenticated, service_role;
grant execute on function public.reject_application(uuid, text) to authenticated, service_role;
