-- WP8.5: bounty-style Today cards.
-- Trend cover for the card media plane; task format + brief + estimated
-- recording time so creator cards read like a job listing.

alter table public.trend_items
  add column if not exists cover_url text;

alter table public.content_tasks
  add column if not exists format text not null default 'video'
    check (format in ('video', 'photo_carousel')),
  add column if not exists brief text,
  add column if not exists estimated_seconds int;
