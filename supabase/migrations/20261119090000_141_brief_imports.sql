-- Brief import: a campaign manager uploads an old brief (PDF, Word, text,
-- pictures of pages) or pastes a link, and the brief-import function turns it
-- into a list of posts it then writes one by one for the Briefs library.
--
--   brief_imports   one row per upload: what was read and the plan (the posts
--                   listed, the product and rules lifted from the document).
--                   The function writes with the service role; managers read
--                   their own company's rows.
--   brief-imports   storage bucket the app uploads the files to, one folder
--                   per company. Files are removed once they have been read.

create table if not exists public.brief_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  -- [{ name, kind }] for every document that was read.
  sources jsonb not null default '[]'::jsonb,
  -- { summary, product, guidance, claims[], posts[] } (ImportPlan in _shared/ai/briefImport.ts).
  plan jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists brief_imports_company_created on public.brief_imports (company_id, created_at desc);

alter table public.brief_imports enable row level security;

drop policy if exists "managers read brief imports" on public.brief_imports;
create policy "managers read brief imports" on public.brief_imports for select to authenticated
  using (public.is_manager_of(company_id));

revoke all on public.brief_imports from anon;

insert into storage.buckets (id, name, public, file_size_limit)
values ('brief-imports', 'brief-imports', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "brief imports read" on storage.objects;
create policy "brief imports read" on storage.objects for select to authenticated
  using (
    bucket_id = 'brief-imports'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_manager_of(public.current_company_id())
  );
drop policy if exists "brief imports insert" on storage.objects;
create policy "brief imports insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brief-imports'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_manager_of(public.current_company_id())
  );
drop policy if exists "brief imports delete" on storage.objects;
create policy "brief imports delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'brief-imports'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_manager_of(public.current_company_id())
  );
