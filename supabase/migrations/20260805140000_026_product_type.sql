-- product_type steers claim extraction in ingest-features.
-- Must be set before a company's first ingest; wrong-prompt rows are
-- sticky under normalized-name idempotency.

alter table public.brand_profiles
  add column if not exists product_type text not null default 'software';

alter table public.brand_profiles
  drop constraint if exists brand_profiles_product_type_check;

alter table public.brand_profiles
  add constraint brand_profiles_product_type_check
    check (product_type in ('software', 'physical'));
