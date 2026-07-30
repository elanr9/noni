-- Attach a signed-up auth user to FieldVision as admin or creator.
-- 1) Magic-link sign in once so auth.users has the row
-- 2) Replace the email below, set role, run via CLI/API
--
-- role: 'admin' | 'creator'

with fv as (
  select id as company_id from public.companies where slug = 'fieldvision' limit 1
),
u as (
  select id as user_id, email
  from auth.users
  where email = 'REPLACE_ME@example.com'
  limit 1
)
insert into public.profiles (id, company_id, role, full_name, onboarded)
select
  u.user_id,
  fv.company_id,
  'admin',              -- or 'creator'
  split_part(u.email, '@', 1),
  true
from u, fv
on conflict (id) do update
set
  company_id = excluded.company_id,
  role = excluded.role,
  onboarded = excluded.onboarded;
