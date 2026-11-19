-- Reference analysis: what a pasted TikTok or Instagram post says and when,
-- what is on screen and how it is cut (ReferenceAnalysis in
-- functions/_shared/ai/contracts.ts), stored next to the older pattern card.
--
-- The analysis has its own status, phase and error so it never disturbs the
-- pattern-card flow (study-reference), which keeps using status, phase and
-- error. reference-analyze polls analysis_status and analysis_phase.

alter table public.reference_studies
  add column if not exists analysis jsonb,
  add column if not exists analysis_version int,
  add column if not exists analysis_status text
    check (analysis_status is null or analysis_status in ('pending', 'done', 'failed')),
  add column if not exists analysis_phase text
    check (analysis_phase is null or analysis_phase in
      ('reading', 'transcribing', 'sampling_frames', 'reading_slides', 'analyzing')),
  add column if not exists analysis_error text,
  add column if not exists analysis_started_at timestamptz,
  add column if not exists analyzed_at timestamptz,
  -- Post metadata from the scrape, as columns so references can be ranked.
  add column if not exists media text check (media is null or media in ('video', 'slideshow')),
  add column if not exists author text,
  add column if not exists author_followers bigint,
  add column if not exists duration_ms int,
  add column if not exists posted_at timestamptz,
  add column if not exists views bigint,
  add column if not exists likes bigint,
  add column if not exists comments bigint,
  add column if not exists shares bigint,
  add column if not exists saves bigint,
  add column if not exists sound_title text,
  add column if not exists sound_original boolean,
  add column if not exists cover_url text,
  -- Contact sheets sampled from the video: [{ path, timestamps_ms }], paths in
  -- the videos bucket under reference-analysis/.
  add column if not exists frame_sheets jsonb;

create index if not exists reference_studies_company_views
  on public.reference_studies (company_id, views desc nulls last)
  where analysis_status = 'done';
