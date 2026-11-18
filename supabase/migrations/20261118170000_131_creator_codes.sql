-- Creator codes for sales attribution.
--
-- A creator's code is the Stripe promotion code (or referral code) the
-- company hands them. sync-conversions credits a customer who used it to that
-- creator, and Analytics splits the credit across the creator's posts.
--
-- attribution_links.code was unique across the whole table, so two companies
-- could not both use "MAYA10". Codes are now unique per company, ignoring
-- case, and a creator holds one creator-level code (rows tied to a task or an
-- assignment are the older per-post links and are left alone).

alter table public.attribution_links drop constraint if exists attribution_links_code_key;

create unique index if not exists attribution_links_company_code_key
  on public.attribution_links (company_id, lower(code));

create unique index if not exists attribution_links_creator_code_key
  on public.attribution_links (company_id, creator_id)
  where creator_id is not null and task_id is null and assignment_id is null;
