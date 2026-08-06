-- Allow screenshot-sourced claims from ingest-features.
-- feature-screenshots bucket: admin uploads for claim drafting; service role
-- signs URLs for Claude vision.

alter table public.product_features
  drop constraint if exists product_features_source_check;

alter table public.product_features
  add constraint product_features_source_check
  check (source in ('repo', 'manual', 'site', 'screenshot'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feature-screenshots',
  'feature-screenshots',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "same company read feature screenshots" on storage.objects for select
  using (
    bucket_id = 'feature-screenshots'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "admins upload feature screenshots" on storage.objects for insert
  with check (
    bucket_id = 'feature-screenshots'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  );

create policy "admins update feature screenshots" on storage.objects for update
  using (
    bucket_id = 'feature-screenshots'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  );

create policy "admins delete feature screenshots" on storage.objects for delete
  using (
    bucket_id = 'feature-screenshots'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  );
