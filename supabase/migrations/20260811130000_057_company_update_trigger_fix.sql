-- Migration 056's company update trigger rejected every non-settings column
-- change for campaign managers, which broke manager onboarding
-- (updateCompanyBasics writes name and website). Only the join code is
-- platform-managed; other columns keep their pre-056 campaign manager access.

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
  if new.join_code is distinct from old.join_code then
    raise exception 'Platform ops only';
  end if;
  return new;
end;
$$;
