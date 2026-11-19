-- The company brain: what Noni knows about a company, as typed records with
-- provenance instead of free text documents.
--
-- brain_sources   a captured document (a website page, a store listing, a
--                 survey answer, an upload). Never edited, only re-captured.
-- brain_chunks    the source cut into passages for retrieval.
-- brain_facts     extracted records (supabase/functions/_shared/ai/contracts.ts
--                 BrainFact). Every record carries where it came from, how far
--                 it can be trusted and whether a generator may state it.
-- brain_conflicts two records that disagree. Kept and shown, never averaged.
-- brain_survey    saved progress through the founder questions.
-- brain_questions things a generator wished it knew, to ask later in context.
-- brain_ingest    progress of the scan that builds the brain, one row per
--                 company, polled by the client.
-- brain-uploads   storage bucket for documents the company hands over.
--
-- Edge functions write with the service role. Campaign managers and company
-- admins read; company admins may also update facts and the survey directly.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------- sources

create table public.brain_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in (
    'website_page', 'app_store', 'codebase', 'upload', 'survey_answer',
    'voice_note', 'reference_post', 'own_post', 'review', 'manual'
  )),
  url text,
  title text,
  content text not null,
  content_hash text not null,
  authority_tier smallint not null check (authority_tier between 1 and 6),
  captured_at timestamptz not null default now(),
  -- Set when extractFacts has run over this source; null means still to do.
  extracted_at timestamptz,
  extract_error text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  unique (company_id, content_hash)
);

create index brain_sources_company_kind_idx
  on public.brain_sources (company_id, kind, captured_at desc);
create index brain_sources_pending_idx
  on public.brain_sources (company_id) where extracted_at is null;

create table public.brain_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.brain_sources(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  idx integer not null,
  text text not null,
  -- Null until embedded; full-text search still finds the chunk.
  embedding extensions.vector(384),
  tsv tsvector generated always as (to_tsvector('english', text)) stored,
  unique (source_id, idx)
);

create index brain_chunks_company_idx on public.brain_chunks (company_id);
create index brain_chunks_embedding_idx
  on public.brain_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index brain_chunks_tsv_idx on public.brain_chunks using gin (tsv);

-- ---------------------------------------------------------------- facts

create table public.brain_facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'company', 'product', 'feature', 'demo_moment', 'persona', 'pain', 'outcome',
    'alternative', 'differentiator', 'quote', 'proof', 'claim', 'objection',
    'offer', 'voice_rule', 'glossary', 'compliance', 'goal', 'creator_pref',
    'angle', 'learning'
  )),
  -- Stable slug within (company, entity_type). A scoped record carries its
  -- scope in the key ("trial@uk"), so two markets never look like a conflict.
  key text not null,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  search_text text not null default '',
  embedding extensions.vector(384),
  tsv tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(search_text, ''))
  ) stored,
  status text not null default 'inferred'
    check (status in ('inferred', 'confirmed', 'disputed', 'stale', 'retired')),
  -- Set by rule in brainSchema.ts, never by a model.
  confidence real not null default 0.4 check (confidence >= 0 and confidence <= 1),
  authority_tier smallint not null default 6 check (authority_tier between 1 and 6),
  usage text not null default 'context_only'
    check (usage in ('generation_ok', 'context_only', 'blocked')),
  freshness text not null default 'slow'
    check (freshness in ('volatile', 'moving', 'slow', 'evidence', 'durable')),
  -- [{ source_id, excerpt, locator? }]
  sources jsonb not null default '[]'::jsonb,
  extracted_by text not null default 'import',
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  valid_until timestamptz,
  last_verified_at timestamptz,
  recheck_after timestamptz,
  supersedes uuid references public.brain_facts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live record per key. Disputed and retired records stay beside it.
create unique index brain_facts_live_key_idx
  on public.brain_facts (company_id, entity_type, key)
  where status in ('inferred', 'confirmed', 'stale');
create index brain_facts_company_type_idx on public.brain_facts (company_id, entity_type);
create index brain_facts_company_status_idx on public.brain_facts (company_id, status);
create index brain_facts_embedding_idx
  on public.brain_facts using hnsw (embedding extensions.vector_cosine_ops);
create index brain_facts_tsv_idx on public.brain_facts using gin (tsv);

create table public.brain_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null,
  key text not null,
  -- [kept record, losing record]
  fact_ids uuid[] not null,
  field text not null,
  -- [{ fact_id, value, authority_tier }]
  "values" jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now(),
  -- Null while open. 'kept:<fact id>' or 'both_wrong' once a human decides.
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz
);

create index brain_conflicts_open_idx
  on public.brain_conflicts (company_id) where resolved_at is null;
create index brain_conflicts_fact_ids_idx on public.brain_conflicts using gin (fact_ids);

-- ---------------------------------------------------------------- survey, questions, ingest

create table public.brain_survey (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- { <question key>: { answer, answered_by, answered_at, fact_ids[] } }
  answers jsonb not null default '{}'::jsonb,
  -- { <question key>: { text, fact_ids[], sources[{ title, url, excerpt }] } }
  suggestions jsonb not null default '{}'::jsonb,
  step integer not null default 0,
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.brain_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  question text not null,
  why text,
  entity_type text,
  -- The job that wanted to know, e.g. 'brief.write'.
  asked_by text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'dismissed')),
  answer text,
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

-- The same open question is queued once however many generators ask it.
create unique index brain_questions_open_once_idx
  on public.brain_questions (company_id, md5(lower(btrim(question))))
  where status = 'open';
create index brain_questions_company_status_idx
  on public.brain_questions (company_id, status, created_at desc);

create table public.brain_ingest (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null default 'idle' check (status in ('idle', 'running', 'done', 'failed')),
  phase text not null default 'crawl'
    check (phase in ('crawl', 'embed', 'extract', 'suggest', 'done')),
  -- What was asked for: { website, app_store_urls[], texts[], documents[] }.
  inputs jsonb not null default '{}'::jsonb,
  -- Counters for the progress display, and inputs that could not be read.
  progress jsonb not null default '{}'::jsonb,
  error text,
  -- A worker holds the run until this time; after it another call may take over.
  lease_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- retrieval

-- Hybrid search over facts: nearest neighbours on the embedding and full-text
-- on title and search_text, fused by reciprocal rank. Either half may be
-- absent (no embedding yet, or no words in the query). Only records a
-- generator is allowed to see come back; authority nudges the order so a
-- confirmed record outranks a guess that merely reads well.
create or replace function public.match_brain(
  p_company uuid,
  p_embedding extensions.vector(384),
  p_query text,
  p_types text[] default null,
  p_limit int default 12
)
returns table (
  id uuid,
  entity_type text,
  key text,
  title text,
  data jsonb,
  status text,
  confidence real,
  authority_tier smallint,
  usage text,
  freshness text,
  sources jsonb,
  valid_until timestamptz,
  recheck_after timestamptz,
  score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    -- Any word may match: a topic sentence ANDed together matches nothing.
    select case
      when coalesce(btrim(p_query), '') = '' then null
      else nullif(replace(plainto_tsquery('english', p_query)::text, '&', '|'), '')::tsquery
    end as tsq
  ),
  eligible as (
    select f.* from public.brain_facts f
    where f.company_id = p_company
      and f.status in ('inferred', 'confirmed')
      and f.usage in ('generation_ok', 'context_only')
      and (p_types is null or f.entity_type = any (p_types))
  ),
  vec as (
    select e.id, row_number() over (order by e.embedding <=> p_embedding) as rn
    from eligible e
    where p_embedding is not null and e.embedding is not null
    order by e.embedding <=> p_embedding
    limit greatest(p_limit, 1) * 4
  ),
  fts as (
    select e.id, row_number() over (order by ts_rank_cd(e.tsv, q.tsq) desc) as rn
    from eligible e, q
    where q.tsq is not null and e.tsv @@ q.tsq
    order by ts_rank_cd(e.tsv, q.tsq) desc
    limit greatest(p_limit, 1) * 4
  ),
  fused as (
    select coalesce(vec.id, fts.id) as id,
      coalesce(1.0 / (60 + vec.rn), 0) + coalesce(1.0 / (60 + fts.rn), 0) as rrf
    from vec full outer join fts on fts.id = vec.id
  )
  select e.id, e.entity_type, e.key, e.title, e.data, e.status, e.confidence,
    e.authority_tier, e.usage, e.freshness, e.sources, e.valid_until, e.recheck_after,
    (fused.rrf * (1 + 0.04 * (6 - e.authority_tier)))::double precision as score
  from fused join eligible e on e.id = fused.id
  order by score desc, e.id
  limit greatest(p_limit, 1)
$$;

-- The same over source passages. p_max_tier keeps model-written documents
-- (tier 6) out unless the caller asks for them.
create or replace function public.match_brain_chunks(
  p_company uuid,
  p_embedding extensions.vector(384),
  p_query text,
  p_limit int default 8,
  p_max_tier int default 5
)
returns table (
  id uuid,
  source_id uuid,
  idx integer,
  text text,
  source_kind text,
  source_url text,
  source_title text,
  authority_tier smallint,
  score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select case
      when coalesce(btrim(p_query), '') = '' then null
      else nullif(replace(plainto_tsquery('english', p_query)::text, '&', '|'), '')::tsquery
    end as tsq
  ),
  eligible as (
    select c.id, c.source_id, c.idx, c.text, c.embedding, c.tsv,
      s.kind, s.url, s.title, s.authority_tier
    from public.brain_chunks c
    join public.brain_sources s on s.id = c.source_id
    where c.company_id = p_company and s.authority_tier <= p_max_tier
  ),
  vec as (
    select e.id, row_number() over (order by e.embedding <=> p_embedding) as rn
    from eligible e
    where p_embedding is not null and e.embedding is not null
    order by e.embedding <=> p_embedding
    limit greatest(p_limit, 1) * 4
  ),
  fts as (
    select e.id, row_number() over (order by ts_rank_cd(e.tsv, q.tsq) desc) as rn
    from eligible e, q
    where q.tsq is not null and e.tsv @@ q.tsq
    order by ts_rank_cd(e.tsv, q.tsq) desc
    limit greatest(p_limit, 1) * 4
  ),
  fused as (
    select coalesce(vec.id, fts.id) as id,
      coalesce(1.0 / (60 + vec.rn), 0) + coalesce(1.0 / (60 + fts.rn), 0) as rrf
    from vec full outer join fts on fts.id = vec.id
  )
  select e.id, e.source_id, e.idx, e.text, e.kind, e.url, e.title, e.authority_tier,
    fused.rrf::double precision as score
  from fused join eligible e on e.id = fused.id
  order by score desc, e.id
  limit greatest(p_limit, 1)
$$;

-- Security invoker: a signed-in caller only ever matches rows RLS lets them read.
revoke all on function public.match_brain(uuid, extensions.vector, text, text[], int) from public, anon;
revoke all on function public.match_brain_chunks(uuid, extensions.vector, text, int, int) from public, anon;
grant execute on function public.match_brain(uuid, extensions.vector, text, text[], int) to authenticated, service_role;
grant execute on function public.match_brain_chunks(uuid, extensions.vector, text, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------- row level security

alter table public.brain_sources enable row level security;
alter table public.brain_chunks enable row level security;
alter table public.brain_facts enable row level security;
alter table public.brain_conflicts enable row level security;
alter table public.brain_survey enable row level security;
alter table public.brain_questions enable row level security;
alter table public.brain_ingest enable row level security;

-- is_manager_of() is the membership check from migration 091: platform admin,
-- or campaign_manager / company_admin in that company. Creators see nothing.
create policy brain_sources_manager_select on public.brain_sources for select to authenticated
  using (public.is_manager_of(company_id));
create policy brain_chunks_manager_select on public.brain_chunks for select to authenticated
  using (public.is_manager_of(company_id));
create policy brain_facts_manager_select on public.brain_facts for select to authenticated
  using (public.is_manager_of(company_id));
create policy brain_conflicts_manager_select on public.brain_conflicts for select to authenticated
  using (public.is_manager_of(company_id));
create policy brain_survey_manager_select on public.brain_survey for select to authenticated
  using (public.is_manager_of(company_id));
create policy brain_questions_manager_select on public.brain_questions for select to authenticated
  using (public.is_manager_of(company_id));
create policy brain_ingest_manager_select on public.brain_ingest for select to authenticated
  using (public.is_manager_of(company_id));

-- Company admins may update facts and the survey. The brain-facts and
-- brain-survey functions are the intended path (they stamp who confirmed what
-- and re-embed); this is the fallback the web server actions can rely on.
create policy brain_facts_admin_update on public.brain_facts for update to authenticated
  using (public.is_platform_admin() or public.member_role(company_id) = 'company_admin')
  with check (public.is_platform_admin() or public.member_role(company_id) = 'company_admin');
create policy brain_survey_admin_update on public.brain_survey for update to authenticated
  using (public.is_platform_admin() or public.member_role(company_id) = 'company_admin')
  with check (public.is_platform_admin() or public.member_role(company_id) = 'company_admin');

-- ---------------------------------------------------------------- uploads

-- Documents a company hands over for brain-ingest to read (brand guides,
-- review exports, call notes). Private; objects live under <company_id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brain-uploads', 'brain-uploads', false, 20971520,
  array['text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/json', 'application/pdf']
)
on conflict (id) do nothing;

create policy "brain uploads read" on storage.objects for select to authenticated
  using (
    bucket_id = 'brain-uploads'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_manager_of(public.current_company_id())
  );
create policy "brain uploads insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brain-uploads'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_manager_of(public.current_company_id())
  );
create policy "brain uploads delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'brain-uploads'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_manager_of(public.current_company_id())
  );
