-- WP7: avatars bucket for onboarding selfie avatars (profiles.avatar_path)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy "same company read avatars" on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "users insert own avatar" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and name = public.current_company_id()::text || '/' || auth.uid()::text || '.jpg'
  );

create policy "users update own avatar" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and name = public.current_company_id()::text || '/' || auth.uid()::text || '.jpg'
  );
