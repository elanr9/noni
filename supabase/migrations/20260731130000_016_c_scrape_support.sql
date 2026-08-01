-- Workstream C support: OCR cache keyed by image content hash, and a
-- normalized text fingerprint on trend_items for near-duplicate detection
-- (one viral post reposted by ten accounts must not appear ten times).

create table public.ocr_cache (
  company_id uuid not null references public.companies,
  image_hash text not null,
  slide_text text not null,
  created_at timestamptz default now(),
  primary key (company_id, image_hash)
);

-- Service role only: no read or write policies.
alter table public.ocr_cache enable row level security;

alter table public.trend_items
  add column content_fingerprint text;

create index trend_items_company_fingerprint
  on public.trend_items (company_id, content_fingerprint)
  where content_fingerprint is not null;
