-- Noni migration 060: invite-only sign-in, creator email invites, no join codes.
-- The app has no sign-up. Everyone reaches Noni through an email invite:
-- company admins from /ops, campaign managers from the web dashboard, creators
-- from the web dashboard or from a campaign manager in the app. A Google
-- sign-in with no pending invite creates no profile; the app blocks it with an
-- invite-required screen. Join codes are gone.

-- 1. Creator invites ----------------------------------------------------------

alter table public.company_invites drop constraint company_invites_role_check;
alter table public.company_invites
  add constraint company_invites_role_check
  check (role in ('company_admin', 'campaign_manager', 'creator'));

-- 2. Permission helpers lose the join code toggle -----------------------------

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
    'manage_publish_time', false
  )
$$;

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

-- 3. Invite-only signup: no invite, no profile --------------------------------
-- Creators carry no permission toggles, so only admin and manager invites get
-- a company_members row.

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

  if v_invite.id is null then
    return new;
  end if;

  insert into public.profiles (id, company_id, role, full_name, onboarded)
  values (
    new.id,
    v_invite.company_id,
    v_invite.role,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    false
  )
  on conflict (id) do nothing;

  if v_invite.role in ('company_admin', 'campaign_manager') then
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
  end if;

  update public.company_invites
    set accepted_at = now()
    where id = v_invite.id;

  return new;
end;
$$;

-- 4. Company update guard no longer knows about join codes --------------------

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
  return new;
end;
$$;

-- 5. Drop join codes -----------------------------------------------------------

alter table public.companies drop column if exists join_code;
drop function if exists public.lookup_company_by_code(text);
drop function if exists public.join_company_by_code(text);
drop function if exists public.regenerate_company_join_code(uuid);
drop function if exists public.generate_join_code();
