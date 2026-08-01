-- Workstream A: inspiration engine foundation.
-- Universal formats library, tenant claim/vocabulary/example tables, the
-- two-phase task status machine, weekly batches, and learning loop state.

-- Kill the legacy auto-fill cron (migration 008). Its freeform drafts write
-- planning_status 'scheduled' directly, bypassing review and poisoning the
-- dedupe corpus and creator baselines. The code stays until D replaces it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'noni-auto-fill-daily') then
    perform cron.unschedule('noni-auto-fill-daily');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Universal: the twelve format library, seeded from ugc-bible.md Part 8 by
-- scripts/seed-formats.ts. No company_id: identical for every tenant.

create table public.formats (
  id text primary key,
  name text not null,
  family text not null check (family in ('video', 'slideshow', 'either')),
  when_to_use text not null,
  why_it_works text not null,
  -- Ordered array of { key, label, required, rules, min, max }.
  slot_schema jsonb not null,
  kill_rules text[] not null default '{}',
  beat_timing text,
  target_length_min_sec int,
  target_length_max_sec int,
  slide_count_min int,
  slide_count_max int,
  requires text[] not null default '{}',
  cta_keyword_policy text not null
    check (cta_keyword_policy in ('required', 'optional', 'none')),
  primary_signal text not null check (primary_signal in
    ('keyword_comments', 'saves_per_reach', 'shares', 'completion', 'comment_velocity')),
  bible_version text not null
);

-- ---------------------------------------------------------------------------
-- Per tenant: claim and vocabulary substrate (written by B and C, read by D).

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  notes text,
  created_at timestamptz default now()
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  claim text not null,
  contradicts text,
  audience_segment text,
  proof text,
  saturation_score int not null default 0 check (saturation_score between 0 and 10),
  source text not null check (source in ('onboarding', 'harvested', 'admin')),
  status text not null check (status in ('candidate', 'active', 'retired')),
  confidence numeric,
  -- Single seasonal window per claim for v1.
  calendar_event_id uuid references public.calendar_events,
  last_used_at timestamptz,
  created_at timestamptz default now()
);

create index claims_company_status on public.claims (company_id, status);

create table public.format_examples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  format_id text not null references public.formats,
  slot_key text not null,
  example text not null,
  source text not null check (source in ('seed', 'harvested', 'admin')),
  created_at timestamptz default now()
);

create index format_examples_company_format
  on public.format_examples (company_id, format_id, slot_key);

create table public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  phrase text not null,
  source text not null check (source in ('harvested', 'admin')),
  created_at timestamptz default now(),
  unique (company_id, phrase)
);

create table public.banned_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  claim text not null,
  created_by uuid references public.profiles,
  created_at timestamptz default now()
);

create table public.ban_list (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  phrase text not null,
  source_task_id uuid references public.content_tasks,
  created_at timestamptz default now(),
  unique (company_id, phrase)
);

-- ---------------------------------------------------------------------------
-- Per tenant: planning cycle (written by D and E1).

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  name text not null,
  goal text,
  starts_on date,
  ends_on date,
  created_at timestamptz default now()
);

create table public.weekly_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  week_start date not null,
  -- No default: the Friday cron states 'generating' explicitly.
  status text not null
    check (status in ('generating', 'in_review', 'approved', 'published')),
  generated_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles,
  -- Outer idempotency guard: one batch per company per week.
  unique (company_id, week_start)
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  task_id uuid not null references public.content_tasks,
  author_id uuid not null references public.profiles,
  author_role text not null check (author_role in ('admin', 'creator')),
  body text not null,
  created_at timestamptz default now()
);

create index task_comments_task on public.task_comments (task_id, created_at);

-- ---------------------------------------------------------------------------
-- Per tenant: learning loop state (written by F only).

create table public.format_stats (
  company_id uuid not null references public.companies,
  format_id text not null references public.formats,
  weight numeric not null default 1,
  status text not null default 'active' check (status in ('active', 'benched')),
  benched_at timestamptz,
  retry_after date,
  reps int not null default 0,
  -- Rolling median of the format's primary signal for this tenant.
  baseline_primary_signal numeric,
  updated_at timestamptz default now(),
  primary key (company_id, format_id)
);

-- Daily signup/revenue rollup for the E2 calendar overlay. Kept separate from
-- revenue_events, which stays the Stripe attribution event log.
create table public.revenue_daily (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  date date not null,
  signups int not null default 0,
  revenue_cents int not null default 0,
  source text not null default 'all',
  unique (company_id, date, source)
);

-- ---------------------------------------------------------------------------
-- profiles: capability gates as constrained boolean columns (a typo cannot
-- silently lock a creator out of formats), plus creator rolling baseline.

alter table public.profiles
  add column has_credential boolean not null default false,
  add column has_scar_tissue boolean not null default false,
  add column has_transformation boolean not null default false,
  add column can_film_with_second_person boolean not null default false,
  add column lives_the_identity boolean not null default false,
  add column on_camera_comfortable boolean not null default false,
  -- Rolling median of the creator's last 20 posts on their primary signal.
  add column baseline_primary_signal numeric,
  add column baseline_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- source_accounts: two corpora, probation state, derived keeper rate.
-- Legacy `kind` stays until the C rewrite of scrape-trends stops writing it.

alter table public.source_accounts
  add column corpus text not null default 'niche'
    check (corpus in ('format_donor', 'niche')),
  add column keeper_rate numeric generated always as (
    case when scraped_count > 0
      then keeper_count::numeric / scraped_count
      else 0
    end
  ) stored;

alter table public.source_accounts drop constraint source_accounts_status_check;
alter table public.source_accounts add constraint source_accounts_status_check
  check (status in ('active', 'probation', 'muted'));

-- ---------------------------------------------------------------------------
-- trend_items: format classification output from C.

alter table public.trend_items
  add column format_id text references public.formats,
  add column slot_fills jsonb,
  add column cta_keyword_count int;

-- ---------------------------------------------------------------------------
-- content_tasks: the two-phase status machine.
--
-- Phase 1, planning (E1 owns): draft -> in_review -> approved -> scheduled,
--   or in_review -> rejected (terminal).
-- Phase 2, production (existing machine, lib/tasks.ts owns): NULL ->
--   assigned -> recorded -> submitted -> (changes_requested ->) approved
--   -> posted. NULL means not yet released to the creator.

-- Nullable first, explicit backfill, then NOT NULL with no default: an
-- insert that forgets planning_status must fail, never silently skip review.
alter table public.content_tasks
  add column planning_status text
    check (planning_status in ('draft', 'in_review', 'approved', 'rejected', 'scheduled'));

update public.content_tasks set planning_status = 'scheduled';

alter table public.content_tasks alter column planning_status set not null;

alter table public.content_tasks
  alter column status drop not null,
  alter column status drop default;

-- Release gate: production status exists only once planning says scheduled.
-- This also forces rejected drafts to keep status null forever.
alter table public.content_tasks add constraint content_tasks_release_gate
  check (status is null or planning_status = 'scheduled');

-- Post object fields (bible Part 7) plus planning cycle references.
alter table public.content_tasks
  add column format_id text references public.formats,
  add column claim_id uuid references public.claims,
  add column search_phrase text,
  add column hook text,
  add column hook_variants jsonb,
  add column slot_fills jsonb,
  add column slides jsonb,
  add column hashtags text[],
  add column pinned_comment text,
  add column audio_direction text
    check (audio_direction in ('trending_sound', 'voiceover', 'both')),
  add column shot_list jsonb,
  add column image_direction jsonb,
  add column plug boolean not null default false,
  add column cta_keyword text,
  add column target_length_sec int,
  add column kill_reason text,
  add column scheduled_for date,
  add column weekly_batch_id uuid references public.weekly_batches,
  add column campaign_id uuid references public.campaigns,
  add column reject_reason text,
  add column filter_flags text[] not null default '{}',
  add column slot_index int not null default 0;

-- Inner idempotency guard: a rerun of the Friday cron cannot double-plan a
-- creator's slot. slot_index distinguishes multiple posts per creator per day
-- when the cadence mix calls for them.
create unique index content_tasks_batch_creator_day
  on public.content_tasks (weekly_batch_id, assigned_to, scheduled_for, slot_index)
  where weekly_batch_id is not null;

create index content_tasks_company_planning
  on public.content_tasks (company_id, planning_status);

-- ---------------------------------------------------------------------------
-- post_metrics: the signals the learning loop actually ranks on.

alter table public.post_metrics
  add column saves bigint,
  add column profile_clicks bigint,
  add column link_clicks bigint,
  add column keyword_comment_count int,
  add column completion_rate numeric;

-- ---------------------------------------------------------------------------
-- hook_bank: redefined as Part 11 writeback. Legacy WP8 columns stay nullable.

alter table public.hook_bank
  add column format_id text references public.formats,
  add column pattern text,
  add column source text not null default 'harvested'
    check (source in ('harvested', 'winning_post', 'admin')),
  add column source_task_id uuid references public.content_tasks;

-- ---------------------------------------------------------------------------
-- RLS

alter table public.formats enable row level security;
alter table public.calendar_events enable row level security;
alter table public.claims enable row level security;
alter table public.format_examples enable row level security;
alter table public.vocabulary enable row level security;
alter table public.banned_claims enable row level security;
alter table public.ban_list enable row level security;
alter table public.campaigns enable row level security;
alter table public.weekly_batches enable row level security;
alter table public.task_comments enable row level security;
alter table public.format_stats enable row level security;
alter table public.revenue_daily enable row level security;

-- Universal library: readable by everyone, written by service role only.
create policy "authenticated read formats" on public.formats for select
  to authenticated using (true);

create policy "same company read calendar events" on public.calendar_events
  for select using (company_id = public.current_company_id());
create policy "admins write calendar events" on public.calendar_events
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read claims" on public.claims
  for select using (company_id = public.current_company_id());
create policy "admins write claims" on public.claims
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read format examples" on public.format_examples
  for select using (company_id = public.current_company_id());
create policy "admins write format examples" on public.format_examples
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read vocabulary" on public.vocabulary
  for select using (company_id = public.current_company_id());
create policy "admins write vocabulary" on public.vocabulary
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read banned claims" on public.banned_claims
  for select using (company_id = public.current_company_id());
create policy "admins write banned claims" on public.banned_claims
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read ban list" on public.ban_list
  for select using (company_id = public.current_company_id());
create policy "admins write ban list" on public.ban_list
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read campaigns" on public.campaigns
  for select using (company_id = public.current_company_id());
create policy "admins write campaigns" on public.campaigns
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "admins read weekly batches" on public.weekly_batches
  for select using (company_id = public.current_company_id() and public.is_admin());
create policy "admins write weekly batches" on public.weekly_batches
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read format stats" on public.format_stats
  for select using (company_id = public.current_company_id());
create policy "admins write format stats" on public.format_stats
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "admins read revenue daily" on public.revenue_daily
  for select using (company_id = public.current_company_id() and public.is_admin());
create policy "admins write revenue daily" on public.revenue_daily
  for all using (company_id = public.current_company_id() and public.is_admin());

-- task_comments: admins see all in company; creators only threads on their
-- own tasks. Distinct from review_events, which stays submission review.
create policy "admins read task comments" on public.task_comments
  for select using (company_id = public.current_company_id() and public.is_admin());
create policy "creators read own task comments" on public.task_comments
  for select using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.content_tasks t
      where t.id = task_id and t.assigned_to = auth.uid()
    )
  );
create policy "admins write task comments" on public.task_comments
  for insert with check (
    company_id = public.current_company_id()
    and public.is_admin()
    and author_id = auth.uid()
    and author_role = 'admin'
  );
create policy "creators comment on own tasks" on public.task_comments
  for insert with check (
    company_id = public.current_company_id()
    and author_id = auth.uid()
    and author_role = 'creator'
    and exists (
      select 1 from public.content_tasks t
      where t.id = task_id and t.assigned_to = auth.uid()
    )
  );

-- Creators must never see planning drafts. Replace the company-wide task
-- read with: admins read everything, creators read only their own released
-- tasks (status non-null implies planning_status = 'scheduled' via the
-- release gate). Admin select stays covered by the "admins write tasks"
-- FOR ALL policy from migration 001.
drop policy "same company read tasks" on public.content_tasks;

create policy "creators read released own tasks" on public.content_tasks
  for select using (
    company_id = public.current_company_id()
    and assigned_to = auth.uid()
    and status is not null
  );
