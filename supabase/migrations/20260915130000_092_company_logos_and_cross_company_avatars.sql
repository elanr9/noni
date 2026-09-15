-- 092: Company logos bucket + avatars readable across shared companies.
--
-- The company switcher shows every company's logo, so logos live in a public
-- bucket keyed by company id. Avatars are stored under {company_id}/{uid}.jpg;
-- a creator working for two companies must stay visible in both, so reads are
-- allowed for any company the viewer belongs to.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone reads company logos" on storage.objects;
create policy "anyone reads company logos" on storage.objects
  for select using (bucket_id = 'company-logos');

drop policy if exists "brand managers write company logo" on storage.objects;
create policy "brand managers write company logo" on storage.objects
  for insert
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_campaign_manager()
    and public.has_permission('manage_brand')
  );

drop policy if exists "brand managers update company logo" on storage.objects;
create policy "brand managers update company logo" on storage.objects
  for update
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_campaign_manager()
    and public.has_permission('manage_brand')
  );

drop policy if exists "brand managers delete company logo" on storage.objects;
create policy "brand managers delete company logo" on storage.objects
  for delete
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_campaign_manager()
    and public.has_permission('manage_brand')
  );

drop policy if exists "same company read avatars" on storage.objects;
create policy "same company read avatars" on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_member_of(((storage.foldername(name))[1])::uuid)
  );
