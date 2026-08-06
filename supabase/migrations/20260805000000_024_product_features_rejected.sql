-- Rejection is a durable state so a repo rescan does not resurrect a claim
-- an admin already dismissed. Idempotency in ingest-codebase skips by
-- normalized name regardless of approved/rejected.

alter table public.product_features
  add column rejected boolean not null default false;
