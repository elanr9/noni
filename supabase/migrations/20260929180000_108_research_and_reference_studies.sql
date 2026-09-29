-- The writer learns the industry and the posts that win in it.
--
-- company_research: one deep dive per company. research-company crawls the
-- landing page, profiles the product, then researches the industry with web
-- search. The structured result feeds the web Brain page; a compact
-- markdown version is written to brand_docs kind industry_research, which
-- every generation reads.
--
-- reference_studies: every pasted TikTok or Instagram reference is scraped,
-- transcribed and broken down once (a pattern card). Cards are distilled into
-- brand_docs kind reference_playbook. ingest-brief reads the stored scrape
-- instead of paying Apify and Deepgram again for a reference it has seen.

alter table public.brand_docs drop constraint if exists brand_docs_kind_check;
alter table public.brand_docs add constraint brand_docs_kind_check
  check (kind = any (array[
    'product_truth', 'audience_niche', 'voice', 'learnings',
    'industry_research', 'reference_playbook'
  ]));

create table public.company_research (
  company_id uuid primary key references public.companies(id) on delete cascade,
  website text,
  status text not null default 'idle'
    check (status in ('idle', 'running', 'done', 'failed')),
  stage text,
  profile jsonb,
  playbook jsonb,
  sources jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.company_research enable row level security;

create policy "members read company research" on public.company_research
  for select
  using (company_id = public.current_company_id());

create table public.reference_studies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null,
  library_item_id uuid references public.library_items(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'failed')),
  platform text,
  format text,
  caption text,
  transcript text,
  slide_texts jsonb,
  pattern jsonb,
  error text,
  created_at timestamptz not null default now(),
  studied_at timestamptz,
  unique (company_id, url)
);

create index reference_studies_company_studied
  on public.reference_studies (company_id, studied_at desc);

alter table public.reference_studies enable row level security;

create policy "members read reference studies" on public.reference_studies
  for select
  using (company_id = public.current_company_id());
