-- Admin rebuild data model (Agent 1).
-- post_types (seeded), brief_segments (the render manifest), submission_segments
-- (per-clip status + backfill from segment_paths), brief_review_events (AI review
-- override log, deliberately separate from the submission-scoped review_events),
-- library_items, creator_accounts, messages, music state on assignments,
-- milestone idempotency on posts, week targets on campaigns, and the
-- briefs.search_query -> search_phrase rename.
--
-- NOT here, already shipped in 022: profiles.credential_line, bio_facts,
-- available. Do not re-add.

-- ---------------------------------------------------------------------------
-- post_types: the eight authoring types. Company-scoped like everything else.
-- Clip count is derived from clip_structure + point count, never set by a human:
--   hook_points_outro -> 1 + N + 1 clips
--   single_clip       -> 1 clip (replay_bait)
--   slide_per_point   -> N slides (carousels; no hook/outro clip, the hook is
--                        the first slide's overlay_text)
-- requires_plug / requires_credential are false only on replay_bait; both
-- exemptions live here on the type, not in validator special cases.
-- default_week_count is the prefilled (editable) split on week setup screens.

create table public.post_types (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies on delete cascade,
  key                  text not null,
  label                text not null,
  family               text not null check (family in ('video', 'photo_carousel')),
  min_points           int  not null,
  max_points           int  not null,
  clip_structure       text not null
    check (clip_structure in ('hook_points_outro', 'single_clip', 'slide_per_point')),
  requires_plug        boolean not null default true,
  requires_credential  boolean not null default true,
  default_week_count   int  not null default 0,
  sort_order           int  not null default 0,
  created_at           timestamptz not null default now(),
  unique (company_id, key)
);

alter table public.post_types enable row level security;

create policy "same company read post types" on public.post_types
  for select using (company_id = public.current_company_id());

create policy "admins write post types" on public.post_types
  for all using (company_id = public.current_company_id() and public.is_admin());

insert into public.post_types
  (company_id, key, label, family, min_points, max_points, clip_structure,
   requires_plug, requires_credential, default_week_count, sort_order)
select c.id, t.key, t.label, t.family, t.min_points, t.max_points,
       t.clip_structure, t.requires_plug, t.requires_credential,
       t.default_week_count, t.sort_order
from public.companies c,
  (values
    ('numbered_list',   'Numbered list',   'video',          3, 10, 'hook_points_outro', true,  true,  8, 1),
    ('talking_head',    'Talking head',    'video',          3,  5, 'hook_points_outro', true,  true,  5, 2),
    ('explainer',       'Explainer',       'video',          3,  5, 'hook_points_outro', true,  true,  3, 3),
    ('contrast',        'Contrast',        'video',          4,  6, 'hook_points_outro', true,  true,  2, 4),
    ('replay_bait',     'Replay bait',     'video',          1,  1, 'single_clip',       false, false, 2, 5),
    ('numbered_tips',   'Numbered tips',   'photo_carousel', 3, 10, 'slide_per_point',   true,  true,  5, 6),
    ('how_to',          'How to',          'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  3, 7),
    ('getting_started', 'Getting started', 'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  2, 8)
  ) as t(key, label, family, min_points, max_points, clip_structure,
         requires_plug, requires_credential, default_week_count, sort_order)
where c.slug = 'fieldvision';

-- ---------------------------------------------------------------------------
-- campaigns: week setup targets. The campaign IS the week; no weeks table.
-- type_split maps post_type key -> count, e.g. {"numbered_list": 8, ...}.
-- These are a pool, not a lock: a post's type stays editable afterwards and
-- the grid header shows live drift.

alter table public.campaigns
  add column video_target     int   not null default 20,
  add column slideshow_target int   not null default 10,
  add column type_split       jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- briefs: rename + new authoring fields. script and hook_options stay
-- (legacy carousels read script; hook_options now holds 8-10 scored variants,
-- not 2). post_type_id null = legacy brief, opens in the old sheet.
-- reviewed_at set when the admin confirms AI review; 'complete' = reviewed_at
-- is not null. kill_reason non-null = generation refused to pad; slot renders
-- empty with the reason.

alter table public.briefs rename column search_query to search_phrase;

alter table public.briefs
  add column post_type_id  uuid references public.post_types,
  add column cta           text,
  add column kill_reason   text,
  add column reviewed_at   timestamptz,
  add column review_result jsonb;

create index briefs_post_type on public.briefs (post_type_id);

-- ---------------------------------------------------------------------------
-- brief_segments: what gets RENDERED and RECORDED. One row per clip or slide,
-- including hook and outro. talking_points jsonb stays what the creator SAYS.
-- The renderer and the recording screen read segments and never touch
-- talking_points.
--
-- The unique constraint is deferrable so re-derivation can shift slot_index
-- values inside one transaction without collisions.

create table public.brief_segments (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies on delete cascade,
  brief_id             uuid not null references public.briefs on delete cascade,
  slot_index           int  not null,
  kind                 text not null check (kind in ('hook', 'point', 'outro', 'slide')),
  talking_point_index  int,
  overlay_text         text,
  show_on_screen       boolean not null default true,
  screenshot_url       text,
  created_at           timestamptz not null default now(),
  unique (brief_id, slot_index) deferrable initially deferred
);

comment on table public.brief_segments is
  'Render manifest: one row per clip or slide, derived from '
  'post_types.clip_structure plus the talking points on brief creation. '
  'RE-DERIVATION RULES (when point count or post type changes): match '
  'surviving segments by talking_point_index, preserve their overlay_text and '
  'screenshot_url, add or remove only at the tail. Never delete-and-rebuild; '
  'the admin may have attached screenshots. The unique (brief_id, slot_index) '
  'constraint is DEFERRABLE INITIALLY DEFERRED so index shifts commit in one '
  'transaction. Default overlay_text on generation: hook segment = the hook '
  'line; point segment = short label, not the full sentence; outro = null '
  'with show_on_screen false; slide = the talking point text (slides are '
  'read, not spoken).';

create index brief_segments_brief on public.brief_segments (brief_id, slot_index);

alter table public.brief_segments enable row level security;

create policy "same company read brief segments" on public.brief_segments
  for select using (company_id = public.current_company_id());

create policy "admins write brief segments" on public.brief_segments
  for all using (company_id = public.current_company_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- submission_segments: per-clip submission state. Per-segment status is what
-- lets an admin reject clip 4 alone; attempt increments per segment so
-- repeated redos on the same slot are visible (a signal about the brief).
-- duration_ms is stored at submit time because overlay timing is absolute on
-- the render timeline. brief_segment_id is null on backfilled legacy rows.

create table public.submission_segments (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies on delete cascade,
  submission_id     uuid not null references public.submissions on delete cascade,
  brief_segment_id  uuid references public.brief_segments,
  slot_index        int  not null,
  storage_path      text not null,
  duration_ms       int,
  status            text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected')),
  attempt           int  not null default 1,
  created_at        timestamptz not null default now()
);

create index submission_segments_submission
  on public.submission_segments (submission_id, slot_index);

alter table public.submission_segments enable row level security;

create policy "same company read submission segments" on public.submission_segments
  for select using (company_id = public.current_company_id());

create policy "admins write submission segments" on public.submission_segments
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "creators insert own submission segments" on public.submission_segments
  for insert with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.creator_id = auth.uid()
    )
  );

-- Backfill: one segment row per segment_paths entry. duration_ms is unknown
-- for legacy clips (nothing recorded it); status inherits from the parent
-- assignment or task.

insert into public.submission_segments
  (company_id, submission_id, slot_index, storage_path, status)
select
  coalesce(a.company_id, t.company_id),
  s.id,
  p.ord - 1,
  p.path,
  case
    when coalesce(a.status, t.status) in ('approved', 'posted') then 'approved'
    else 'submitted'
  end
from public.submissions s
cross join lateral unnest(s.segment_paths) with ordinality as p(path, ord)
left join public.content_tasks t on t.id = s.task_id
left join public.assignments a on a.id = s.assignment_id
where s.segment_paths is not null
  and coalesce(a.company_id, t.company_id) is not null;

-- Per-clip rejection comments stay in the existing review_events system,
-- scoped to a segment when one applies.

alter table public.review_events
  add column segment_id uuid references public.submission_segments;

-- ---------------------------------------------------------------------------
-- brief_review_events: the AI review override log. Separate from
-- review_events, which is the production submission review thread with
-- submission-joined RLS; do not merge them. A check overridden twenty times
-- is a wrong check, and this table is how we see which one.
-- diff = {field, before, after} on event 'edit'.

create table public.brief_review_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies on delete cascade,
  brief_id    uuid not null references public.briefs on delete cascade,
  author_id   uuid references public.profiles,
  event       text not null check (event in ('override', 'edit', 'confirm')),
  check_id    text,
  tier        int,
  diff        jsonb,
  created_at  timestamptz not null default now()
);

create index brief_review_events_brief
  on public.brief_review_events (brief_id, created_at desc);

create index brief_review_events_check
  on public.brief_review_events (company_id, check_id);

alter table public.brief_review_events enable row level security;

create policy "same company read brief review events" on public.brief_review_events
  for select using (company_id = public.current_company_id());

create policy "admins write brief review events" on public.brief_review_events
  for all using (company_id = public.current_company_id() and public.is_admin());

-- Tenant ban list: when the admin rewrites a generated line, the removed
-- phrase appends here and generation avoids it.

alter table public.brand_profiles
  add column banned_phrases text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- library_items: one list, four source chips. "Our posts" rows carry post_id;
-- references carry url + thumbnail; ideas and creator submissions carry text.
-- Using an item marks it used (used_count, last_used_at), never removes it.

create table public.library_items (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies on delete cascade,
  source         text not null
    check (source in ('idea', 'our_post', 'reference', 'from_creator')),
  text           text,
  url            text,
  thumbnail_url  text,
  post_type_id   uuid references public.post_types,
  creator_id     uuid references public.profiles,
  post_id        uuid references public.posts,
  used_count     int  not null default 0,
  last_used_at   timestamptz,
  created_by     uuid references public.profiles,
  created_at     timestamptz not null default now()
);

create index library_items_company_source
  on public.library_items (company_id, source, created_at desc);

alter table public.library_items enable row level security;

create policy "same company read library" on public.library_items
  for select using (company_id = public.current_company_id());

create policy "admins write library" on public.library_items
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "creators submit library ideas" on public.library_items
  for insert with check (
    company_id = public.current_company_id()
    and source = 'from_creator'
    and created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- creator_accounts: the once-per-creator account approval gate. Approval and
-- account linking are the same moment, so the handles live here. decision is
-- structured data (not a free-text note) so this can later become an
-- automated vision check. reason is required by the app on needs_changes.

create table public.creator_accounts (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies on delete cascade,
  creator_id                  uuid not null references public.profiles on delete cascade,
  status                      text not null default 'pending'
    check (status in ('pending', 'needs_changes', 'approved')),
  tiktok_handle               text,
  instagram_handle            text,
  instagram_recording_path    text,
  tiktok_recording_path       text,
  instagram_screenshot_path   text,
  tiktok_screenshot_path      text,
  reason                      text,
  decision                    jsonb,
  decided_by                  uuid references public.profiles,
  decided_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (company_id, creator_id)
);

alter table public.creator_accounts enable row level security;

create policy "admins read creator accounts" on public.creator_accounts
  for select using (company_id = public.current_company_id() and public.is_admin());

create policy "creators read own account" on public.creator_accounts
  for select using (
    company_id = public.current_company_id() and creator_id = auth.uid()
  );

create policy "admins write creator accounts" on public.creator_accounts
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "creators insert own account" on public.creator_accounts
  for insert with check (
    company_id = public.current_company_id() and creator_id = auth.uid()
  );

create policy "creators resubmit own account" on public.creator_accounts
  for update using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
    and status <> 'approved'
  )
  with check (
    company_id = public.current_company_id() and creator_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- messages: one thread per creator, keyed (company_id, creator_id). A message
-- can carry a brief or assignment reference that renders inline; the per-post
-- chat in Review opens this same thread scrolled to that post. Two entry
-- points, one system.

create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies on delete cascade,
  creator_id     uuid not null references public.profiles on delete cascade,
  author_id      uuid not null references public.profiles,
  body           text not null,
  brief_id       uuid references public.briefs,
  assignment_id  uuid references public.assignments,
  created_at     timestamptz not null default now()
);

create index messages_thread
  on public.messages (company_id, creator_id, created_at);

alter table public.messages enable row level security;

create policy "admins read messages" on public.messages
  for select using (company_id = public.current_company_id() and public.is_admin());

create policy "creators read own thread" on public.messages
  for select using (
    company_id = public.current_company_id() and creator_id = auth.uid()
  );

create policy "admins write messages" on public.messages
  for all using (company_id = public.current_company_id() and public.is_admin());

create policy "creators post to own thread" on public.messages
  for insert with check (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
    and author_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- assignments: slideshow music state. On assignments, not posts: post-approved
-- inserts one posts row PER PLATFORM (two per assignment) and only after
-- Upload-Post responds, so there is no reliable 1:1 posts row. "Music added"
-- is one creator tap covering both platforms, and the assignment is the unit
-- that owns earnings. Earnings unlock for slideshows only when
-- music_approved_at is set (gate enforced in poll-metrics bounty crediting).

alter table public.assignments
  add column music_marked_by_creator_at timestamptz,
  add column music_approved_at          timestamptz,
  add column music_approved_by          uuid references public.profiles;

-- ---------------------------------------------------------------------------
-- posts: milestone idempotency. Thresholds (5000, 10000, 50000, 100000,
-- 1000000) append here when the notification fires; a metrics re-poll checks
-- membership before firing so a milestone never repeats.

alter table public.posts
  add column milestones_fired int[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Storage: segment screenshots (admin editor uploads) and account
-- verification media (creator recordings + screenshots).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brief-assets', 'brief-assets', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "same company read brief assets" on storage.objects for select
  using (
    bucket_id = 'brief-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "admins write brief assets" on storage.objects for insert
  with check (
    bucket_id = 'brief-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  );

create policy "admins delete brief assets" on storage.objects for delete
  using (
    bucket_id = 'brief-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-verification', 'account-verification', false, 104857600,
  array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "same company read account verification" on storage.objects for select
  using (
    bucket_id = 'account-verification'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "creators upload account verification" on storage.objects for insert
  with check (
    bucket_id = 'account-verification'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );
