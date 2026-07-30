-- Per-creator Upload-Post profile. Posts go to the assigned creator's linked accounts.

alter table public.profiles
  add column if not exists upload_post_profile text;

-- Drop company-level profile key; connection is per creator now.
update public.companies
set settings = coalesce(settings, '{}'::jsonb) - 'upload_post_profile'
where settings ? 'upload_post_profile';
