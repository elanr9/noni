-- 047: per-company payout kill switch for test mode.
-- Payouts are disabled by default; flip to true when a company goes live:
--   update public.companies set payouts_enabled = true where id = '<company_id>';

alter table public.companies
  add column payouts_enabled boolean not null default false;
