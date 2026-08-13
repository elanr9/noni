-- Noni migration 051: platform admin tenant powers.
-- The single platform admin (role 'admin') also acts inside their attached
-- company: is_campaign_manager() now covers them, and their profile moves to
-- FieldVision with can_create so creator write paths open up. can_create()
-- (migration 043) already passes any profile with can_create = true, so it
-- needs no change. The Noni Platform company row stays as-is.

create or replace function public.is_campaign_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('campaign_manager', 'admin')
  )
$$;

-- Attach the platform admin to the operating tenant. Local seeds call it
-- FieldVision (slug fieldvision); in production the tenant was renamed, so
-- fall back to the oldest company that is not the Noni Platform shell.
do $$
declare
  v_company uuid;
begin
  select id into v_company from public.companies where slug = 'fieldvision';
  if v_company is null then
    select id into v_company
    from public.companies
    where slug <> 'noni-platform'
    order by created_at
    limit 1;
  end if;
  if v_company is null then
    raise notice 'no tenant company yet; platform admin profile left as-is';
    return;
  end if;
  update public.profiles
    set company_id = v_company,
        can_create = true
    where role = 'admin';
end;
$$;
