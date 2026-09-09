-- Shared media library for the product: screenshots and screen recordings
-- campaign managers reuse across posts. Recordings also start working as
-- segment media: brief-assets accepted only images at 10 MB, so every screen
-- recording attach failed at the bucket, and its update policy still required
-- is_admin() while insert took is_campaign_manager(), so a manager re-attaching
-- over an existing path was refused too.

update storage.buckets
set
  file_size_limit = 209715200,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime'
  ]
where id = 'brief-assets';

drop policy if exists "admins update brief assets" on storage.objects;
create policy "admins update brief assets" on storage.objects for update
  using (
    bucket_id = 'brief-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_campaign_manager()
  )
  with check (
    bucket_id = 'brief-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_campaign_manager()
  );

create table public.media_library (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('screenshot', 'recording')),
  -- Object path in brief-assets, under <company_id>/library/.
  path text not null,
  -- Poster JPEG for recordings, same folder. Null for screenshots.
  thumb_path text,
  duration_ms integer,
  width integer,
  height integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index media_library_company_kind_idx
  on public.media_library (company_id, kind, created_at desc);

alter table public.media_library enable row level security;

create policy "media library same company read" on public.media_library
  for select using (company_id = public.current_company_id());

create policy "media library managers insert" on public.media_library
  for insert with check (
    company_id = public.current_company_id() and public.is_campaign_manager()
  );

create policy "media library managers delete" on public.media_library
  for delete using (
    company_id = public.current_company_id() and public.is_campaign_manager()
  );
