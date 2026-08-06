-- Phase 2: query bank. Admins draft briefs from search strings people type
-- with a deadline. Autocomplete and comment mining come later; this migration
-- only creates the table, RLS, and the FieldVision manual seed.

create table public.search_queries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  query        text not null,
  source       text not null check (source in ('manual', 'autocomplete', 'comments')),
  season_start int check (season_start is null or season_start between 1 and 12),
  season_end   int check (season_end is null or season_end between 1 and 12),
  used_count   int not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index search_queries_company_used
  on public.search_queries (company_id, used_count);

alter table public.search_queries enable row level security;

create policy "same company read search queries" on public.search_queries
  for select
  using (company_id = public.current_company_id());

create policy "admins write search queries" on public.search_queries
  for all
  using (company_id = public.current_company_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed: FieldVision recruiting queries. Soccer recruiting runs on soft
-- windows across the year, so season_start / season_end stay null.

insert into public.search_queries (company_id, query, source)
select c.id, q.query, 'manual'
from public.companies c,
  (values
    ('how to email college coaches'),
    ('what to put in a recruiting email'),
    ('are ID camps worth it'),
    ('how to make a highlight video'),
    ('when do coaches start recruiting'),
    ('NCSA review'),
    ('is NCSA worth it'),
    ('best D1 schools for soccer'),
    ('walk on vs scholarship'),
    ('how to get recruited as a junior'),
    ('D2 vs D1 soccer'),
    ('college soccer recruiting timeline')
  ) as q(query)
where c.slug = 'fieldvision'
  and not exists (
    select 1
    from public.search_queries sq
    where sq.company_id = c.id
      and sq.query = q.query
  );
