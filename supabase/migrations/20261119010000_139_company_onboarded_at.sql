-- Setup is finished per company, not only per person. An account that was
-- already onboarded (the Noni platform account, or an admin who runs another
-- company) still walks a new company through onboarding; the web marks the
-- company here when that flow completes.
alter table public.companies add column if not exists onboarded_at timestamptz;

-- Companies whose admin already finished onboarding keep their dashboard.
update public.companies c
set onboarded_at = now()
where c.onboarded_at is null
  and exists (
    select 1
    from public.company_members m
    join public.profiles p on p.id = m.profile_id
    where m.company_id = c.id
      and m.role = 'company_admin'
      and m.removed_at is null
      and p.onboarded
      and p.role is distinct from 'admin'
  );
