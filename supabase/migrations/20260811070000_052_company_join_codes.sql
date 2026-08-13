-- Noni migration 052: company join codes.
-- Creators join their company during onboarding by entering a short code.
-- Codes are 6 uppercase alphanumeric chars from an unambiguous alphabet
-- (no 0/O/1/I). Platform admin manages codes from /ops; campaign managers
-- can read their own company's code via the existing "same company read"
-- row policy on companies.

-- 1. Code generator -----------------------------------------------------------

create or replace function public.generate_join_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select string_agg(
    substr(
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      (get_byte(r.b, i.i) % 32) + 1,
      1
    ),
    '' order by i.i
  )
  from extensions.gen_random_bytes(6) as r(b),
       generate_series(0, 5) as i(i)
$$;

-- 2. Column + backfill --------------------------------------------------------

alter table public.companies
  add column join_code text default public.generate_join_code();

do $$
declare
  c record;
  v_code text;
begin
  for c in select id from public.companies where join_code is null loop
    loop
      v_code := public.generate_join_code();
      exit when not exists (
        select 1 from public.companies where join_code = v_code
      );
    end loop;
    update public.companies set join_code = v_code where id = c.id;
  end loop;
end;
$$;

alter table public.companies alter column join_code set not null;
alter table public.companies add constraint companies_join_code_key unique (join_code);

-- 3. Lookup RPC: any signed-in user can resolve a code to a company name ------

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
$$;

revoke execute on function public.lookup_company_by_code(text) from public, anon;
grant execute on function public.lookup_company_by_code(text) to authenticated;

-- 4. Join RPC: creator attaches themselves to the company for the code --------

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
  where c.join_code = upper(trim(code));

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

revoke execute on function public.join_company_by_code(text) from public, anon;
grant execute on function public.join_company_by_code(text) to authenticated;

-- 5. Regenerate RPC: platform admin only, used by the /ops dashboard ----------

create or replace function public.regenerate_company_join_code(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform ops only';
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

revoke execute on function public.regenerate_company_join_code(uuid) from public, anon;
grant execute on function public.regenerate_company_join_code(uuid) to authenticated;
