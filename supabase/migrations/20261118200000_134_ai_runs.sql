-- One row per Claude call made through supabase/functions/_shared/ai/llm.ts,
-- success or failure: what ran, what it cost, how long it took and why it
-- stopped. Written by edge functions with the service role; nothing on the
-- client reads it.

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The caller's name for the job, e.g. 'brief.write'.
  task text not null,
  tier text not null check (tier in ('writer', 'fast', 'research')),
  -- The model that served the call (the fallback model when one stepped in).
  model text not null,
  -- Null for calls that belong to no company; kept when a company is deleted.
  company_id uuid references public.companies on delete set null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  -- Estimate from the price table in llm.ts; null when the model is not in it.
  cost_usd numeric(12, 6),
  latency_ms int not null,
  stop_reason text,
  error text,
  request_id text
);

create index if not exists ai_runs_company_created_idx
  on public.ai_runs (company_id, created_at desc);
create index if not exists ai_runs_task_created_idx
  on public.ai_runs (task, created_at desc);

-- Service role only: no policies.
alter table public.ai_runs enable row level security;
