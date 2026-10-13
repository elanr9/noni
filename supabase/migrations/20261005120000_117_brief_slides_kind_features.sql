-- 117: brief kinds, slide model and library feature media for the briefs redesign.
-- Additive only. briefs.format keeps 'video' (reel) and 'photo_carousel' (slideshow).
--
-- Reverse:
--   drop index if exists public.briefs_company_status_idx;
--   alter table public.briefs drop column creator_note, drop column status, drop column cta_feature_id,
--     drop column open, drop column story, drop column slides, drop column kind;
--   alter table public.product_features drop column is_general, drop column screenshot_url, drop column clip_url;

alter table public.briefs
  add column if not exists kind text check (kind in ('handheld', 'story', 'open')),
  add column if not exists slides jsonb not null default '[]'::jsonb,
  add column if not exists story jsonb,
  add column if not exists open jsonb,
  add column if not exists cta_feature_id uuid references public.product_features (id) on delete set null,
  add column if not exists status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  add column if not exists creator_note text;

create index if not exists briefs_company_status_idx on public.briefs (company_id, status);

alter table public.product_features
  add column if not exists clip_url text,
  add column if not exists screenshot_url text,
  add column if not exists is_general boolean not null default false;

create unique index if not exists product_features_one_general_idx
  on public.product_features (company_id) where is_general;
