-- Phase 1 brief rebuild: structured briefs (hooks, talking points, hashtags),
-- creator voice fields on profiles, the approved-claims library
-- (product_features, DDL moved up from Phase 3), the validation log, and the
-- FieldVision hashtag bank seed.

-- ---------------------------------------------------------------------------
-- briefs: structured fields. script stays: required for photo_carousel slide
-- copy, legacy fallback for video. generation_id is minted by ingest-brief and
-- carried through createBrief so brief_validations rows join up later.

alter table public.briefs
  add column hook_options   jsonb  not null default '[]'::jsonb,
  add column talking_points jsonb  not null default '[]'::jsonb,
  add column hashtags       text[] not null default '{}',
  add column search_query   text,
  add column point_count    int,
  add column target_words   int    not null default 380,
  add column generation_id  uuid;

-- ---------------------------------------------------------------------------
-- profiles: performer voice fields. credential_line renders at teleprompter
-- time, never baked into a brief. available is write-only in Phase 1.

alter table public.profiles
  add column credential_line text,
  add column bio_facts       jsonb   not null default '[]'::jsonb,
  add column script_mode     text    not null default 'beats',
  add column available       boolean not null default true;

alter table public.profiles
  add constraint script_mode_valid check (script_mode in ('beats', 'full'));

-- ---------------------------------------------------------------------------
-- brand_profiles: hashtag bank the validator checks generated hashtags against.

alter table public.brand_profiles
  add column hashtag_bank text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- product_features: the approved-claims library. Product points in briefs must
-- be composed from approved rows; the model phrases, it does not invent.
-- ingest-codebase (Phase 3) will insert source='repo', approved=false rows.

create table public.product_features (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies on delete cascade,
  name         text not null,
  what_it_does text not null,
  claim        text not null,
  surface      text,
  source       text not null check (source in ('repo', 'manual', 'site')),
  source_ref   text,
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index product_features_company_approved
  on public.product_features (company_id, approved);

alter table public.product_features enable row level security;

create policy "same company read approved features" on public.product_features
  for select
  using (company_id = public.current_company_id() and approved);

create policy "admins write product features" on public.product_features
  for all
  using (company_id = public.current_company_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- brief_validations: one row per validation attempt, written by ingest-brief
-- via service role. brief_id is null at generation time (nothing is saved
-- until the admin edits and saves); generation_id is the durable join key.
-- "Did the retry fix it" = attempt 2 row with passed = true.

create table public.brief_validations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies,
  brief_id      uuid references public.briefs,
  generation_id uuid not null,
  attempt       int not null default 1,
  passed        boolean not null,
  failures      jsonb not null default '[]'::jsonb,
  warnings      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index brief_validations_generation
  on public.brief_validations (generation_id);

create index brief_validations_company_created
  on public.brief_validations (company_id, created_at desc);

alter table public.brief_validations enable row level security;

create policy "same company read brief validations" on public.brief_validations
  for select
  using (company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- Seed: FieldVision hashtag bank. Ensure the brand_profiles row exists first
-- (brand-ingest may not have run against a fresh environment).

insert into public.brand_profiles (company_id)
select c.id
from public.companies c
where c.slug = 'fieldvision'
  and not exists (
    select 1 from public.brand_profiles bp where bp.company_id = c.id
  );

update public.brand_profiles bp
set hashtag_bank = array[
  '#collegesoccer', '#collegerecruiting', '#d1soccer', '#ncaa', '#d1athlete',
  '#soccertraining', '#collegesoccerrecruiting', '#scholarship',
  '#fieldvision', '#d1'
]
from public.companies c
where c.id = bp.company_id
  and c.slug = 'fieldvision';

-- ---------------------------------------------------------------------------
-- Seed: FieldVision approved claims.
--
-- Claim text is written by the admin, not generated. Each claim: one line a
-- 20 year old could say on camera, under 20 words, mechanism not benefit.
-- Rows are approved = true because a human wrote them.

insert into public.product_features
  (company_id, name, what_it_does, claim, surface, source, approved)
select c.id, f.name, f.what_it_does, f.claim, f.surface, 'manual', true
from public.companies c,
  (values
    ('Bulk coach emails',
     'Sends a separate personalized email to every coach on the user''s school list in one action',
     'You hit send once and it goes out to fifty coaches, all different emails',
     null::text),
    ('Program specific personalization',
     'Writes each email around a real detail about that program, such as a result last season or a graduating position',
     'Each email mentions something real about their team, like they graduate both strikers in 2026',
     null::text),
    ('Automatic follow ups',
     'Drafts and sends follow ups to coaches who have not replied after a week',
     'If a coach doesn''t reply in a week it drafts the follow up and sends it',
     null::text),
    ('Matched school list',
     'Builds a ranked list of programs fitting the user''s level, position and class year, refreshed every 48 hours',
     'It builds your school list for you and ranks every program by how well you fit',
     null::text),
    ('Position needs',
     'Shows which position and class year each program is currently recruiting for',
     'You can see if a school actually needs your position for your year before you email',
     null::text),
    ('Ask AI school search',
     'Answers plain language questions across 1,439 college soccer programs',
     'You type D1 schools that need a striker and it pulls them from 1,439 programs',
     null::text),
    ('Tag yourself highlight reel',
     'User taps themselves in team footage clip by clip and it cuts a highlight reel around them',
     'You tap yourself in your team''s film and it cuts the highlight reel around you',
     null::text),
    ('Talk to college players',
     'Lets users book a call with current college players at D1, D2 and D3 programs',
     'You can book a call with a guy already playing at the school you want',
     null::text),
    ('Coach reply drafting',
     'Drafts a reply in the user''s voice when a coach responds, with quick options for common answers',
     'When a coach writes back it has your reply drafted before you open it',
     null::text),
    ('Price',
     '$20 per month billed annually or $30 month to month',
     'It''s twenty bucks a month if you pay for the year',
     null::text)
  ) as f(name, what_it_does, claim, surface)
where c.slug = 'fieldvision';
