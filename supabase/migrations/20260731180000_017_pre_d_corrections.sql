-- Pre-D corrections: classification transparency (every verdict stored with
-- confidence and reason), per-item topic for rolling-window saturation, low
-- signal flag for caption-only media, and unknown saturation as null.

alter table public.trend_items
  add column classify_confidence numeric,
  add column classify_reason text,
  add column topic text,
  add column low_signal boolean not null default false;

-- Saturation window query: recent topic-labeled items per company.
create index trend_items_company_topic_recent
  on public.trend_items (company_id, scraped_at desc)
  where topic is not null;

-- Unknown saturation is null, never a fake zero. Consumers must treat null
-- as "not enough data". Table is empty in prod at migration time.
alter table public.claims
  alter column saturation_score drop not null,
  alter column saturation_score drop default;
