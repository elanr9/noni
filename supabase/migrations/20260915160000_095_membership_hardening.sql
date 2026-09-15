-- 095: membership hardening
--
-- 1. apply_invite_membership is internal (service role and security definer
--    triggers only). It was executable by any signed-in user, who could attach
--    a pending invite to their own profile.
-- 2. Platform admins hold no company membership; the insert trigger used to
--    turn them into company_admin of their active tenant.
-- 3. Users can update their own profile row; block promoting yourself to the
--    platform admin role from a user session.

revoke execute on function public.apply_invite_membership(uuid, uuid) from public, anon, authenticated;

create or replace function public.ensure_membership_for_active_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_company_id is null or new.role = 'admin' then
    return new;
  end if;
  insert into public.company_members (company_id, profile_id, role, permissions)
  values (
    new.active_company_id,
    new.id,
    new.role,
    case
      when new.role = 'company_admin' then public.full_member_permissions()
      else public.default_member_permissions()
    end
  )
  on conflict (company_id, profile_id) do update
    set removed_at = null;
  return new;
end;
$$;

create or replace function public.protect_platform_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin'
     and old.role is distinct from 'admin'
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'platform admin role cannot be self assigned'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_platform_admin on public.profiles;
create trigger profiles_protect_platform_admin
  before update of role on public.profiles
  for each row execute function public.protect_platform_admin_role();
