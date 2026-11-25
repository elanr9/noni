-- 159: the basics a creator gives on sign up, for the marketplace (brands
-- filter and match on them) and for knowing where creators come from.
-- Age is kept as birth_year (migration 155) and gender already exists.

alter table public.creator_profiles
  add column if not exists country text,
  add column if not exists found_via text;
