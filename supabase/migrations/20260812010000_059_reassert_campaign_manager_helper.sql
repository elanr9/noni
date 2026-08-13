-- Migration 058 was amended while being applied in parallel sessions, so the
-- remote may hold an early draft of is_campaign_manager() that dropped the
-- platform admin's tenant powers (granted in migration 051). Re-assert the
-- final definition: tenant power spans campaign managers, the company admin
-- (web), and the platform admin.

create or replace function public.is_campaign_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('campaign_manager', 'company_admin', 'admin')
  )
$$;
