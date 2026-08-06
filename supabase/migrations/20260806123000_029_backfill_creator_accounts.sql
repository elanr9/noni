-- 029: backfill creator_accounts for creators who predate the account
-- approval gate. publish-campaign now assigns only to creators with an
-- approved creator_accounts row; creators already working (they have
-- assignments) are grandfathered in so publishing keeps working.

insert into public.creator_accounts (company_id, creator_id, status, decision, decided_at)
select distinct a.company_id, a.creator_id, 'approved',
       jsonb_build_object('backfilled', true), now()
from public.assignments a
where not exists (
  select 1 from public.creator_accounts ca
  where ca.company_id = a.company_id and ca.creator_id = a.creator_id
);
