-- The seeded Noni Platform company is not a tenant; creators must never be
-- able to look up or join it by code.

create or replace function public.lookup_company_by_code(code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name
  from public.companies c
  where auth.uid() is not null
    and c.join_code = upper(trim(code))
    and c.slug <> 'noni-platform'
$$;

create or replace function public.join_company_by_code(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_company_name text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select c.id, c.name into v_company_id, v_company_name
  from public.companies c
  where c.join_code = upper(trim(code))
    and c.slug <> 'noni-platform';

  if v_company_id is null then
    raise exception 'Invalid join code';
  end if;

  update public.profiles
  set company_id = v_company_id
  where id = auth.uid() and role = 'creator';

  if not found then
    raise exception 'Only creators can join with a code';
  end if;

  return v_company_name;
end;
$$;
