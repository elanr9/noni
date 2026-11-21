-- 149: What a new company told us at onboarding about the campaign it wants,
-- the questions a UGC agency asks a new client. Written by the web
-- onboarding (src/app/onboarding/actions.ts), one key at a time:
--   goal             'signups' | 'sales' | 'audience' | 'trust'
--   platforms        text[] of 'tiktok' | 'instagram' | 'youtube'
--   creators_wanted  '1-5' | '5-10' | '10-25' | '25+'
--   monthly_budget   'under_1k' | '1k-3k' | '3k-10k' | '10k+' | 'unsure'
--   launch           'this_week' | 'this_month' | 'exploring'
alter table public.companies
  add column if not exists intake jsonb not null default '{}'::jsonb;
