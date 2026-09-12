-- References carry the manager's optional notes on how the source should
-- translate to our product. Media library items carry an optional
-- description of what the screenshot or recording shows so a post can be
-- written from the media alone. Fill snapshots accept the new media source.

alter table public.library_items add column if not exists notes text;

alter table public.media_library add column if not exists description text;

alter table public.brief_ai_snapshots
  drop constraint if exists brief_ai_snapshots_source_kind_check;

alter table public.brief_ai_snapshots
  add constraint brief_ai_snapshots_source_kind_check
  check (source_kind in ('port', 'example', 'idea', 'feature', 'media', 'auto'));
