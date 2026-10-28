-- v2 Briefs library: guided templates and outlines the campaign manager
-- saves for creators. Separate from the weekly `briefs` rows; the Briefs tab
-- is this library now. Ids are client generated text so a guided brief and
-- its outline twin (`<id>-o`) can be written together, offline first.

create table public.library_briefs (
  id text primary key,
  company_id uuid not null references public.companies,
  kind text not null check (kind in ('Guided', 'Outline')),
  type text not null check (type in ('Talking Head', 'Long Text', 'Slideshow', 'Greenscreen')),
  title text not null,
  notes text not null default '',
  link text,
  created_by uuid references public.profiles,
  -- The guided brief an outline twin was saved with.
  from_id text,
  audio jsonb,
  clips jsonb,
  g jsonb,
  lt jsonb,
  caption text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_briefs_company_updated on public.library_briefs (company_id, updated_at desc);

alter table public.library_briefs enable row level security;

create policy "same company read library briefs" on public.library_briefs for select
  using (company_id = public.current_company_id());

create policy "admins write library briefs" on public.library_briefs for all
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());

-- Posts can point at the library brief they were made from; matching is by
-- title until the creator flows write this.
alter table public.assignments add column library_brief_id text references public.library_briefs (id) on delete set null;
