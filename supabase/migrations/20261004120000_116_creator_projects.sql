-- Studio projects. A creator's work in progress on a post: the edit
-- document (see lib/edit-document.ts) plus the assignment it is for. One
-- project per assignment. The document is also frozen onto the submission
-- at submit time so the render and the review read exactly what was sent.

create table if not exists public.creator_projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  format text not null check (format in ('video', 'slideshow')),
  document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id)
);

create index if not exists creator_projects_creator_idx
  on public.creator_projects (company_id, creator_id, updated_at desc);

alter table public.creator_projects enable row level security;

create policy "creators own their projects" on public.creator_projects
  for all
  using (company_id = public.current_company_id() and creator_id = auth.uid())
  with check (company_id = public.current_company_id() and creator_id = auth.uid());

create policy "managers read projects" on public.creator_projects
  for select
  using (company_id = public.current_company_id() and public.is_campaign_manager());

alter table public.submissions
  add column if not exists project_id uuid references public.creator_projects(id) on delete set null,
  add column if not exists edit_document jsonb;

comment on column public.submissions.edit_document is
  'Frozen copy of creator_projects.document at submit; render-submission builds the final media from it when present.';
