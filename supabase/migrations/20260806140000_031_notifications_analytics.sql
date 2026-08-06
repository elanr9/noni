-- Agent 7: notifications and analytics.
-- 1. Atomic milestone claim so two concurrent polls cannot double-notify.
-- 2. post_metrics.saves (Upload-Post exposes it on some platforms; nullable).
-- 3. conversion_daily: day-level aggregates pulled from the FieldVision
--    product database by sync-conversions. AGGREGATES ONLY, never user rows.
-- 4. Daily cron for sync-conversions.

-- ---------------------------------------------------------------------------
-- 1. Milestone claim. Appends the threshold to posts.milestones_fired only if
-- absent and reports whether this call claimed it. The caller sends the push
-- only on true, so a re-poll or a concurrent poll can never re-notify.

create or replace function public.claim_post_milestone(
  p_post_id uuid,
  p_threshold int
) returns boolean
language sql
as $$
  with claimed as (
    update public.posts
    set milestones_fired = milestones_fired || p_threshold
    where id = p_post_id
      and not (milestones_fired @> array[p_threshold])
    returning id
  )
  select exists (select 1 from claimed);
$$;

-- ---------------------------------------------------------------------------
-- 2. Saves. Nullable: platforms that do not report it stay null, which the
-- UI must distinguish from zero.

alter table public.post_metrics add column if not exists saves bigint;

-- ---------------------------------------------------------------------------
-- 3. conversion_daily. One row per (company, day, creator). creator_id null
-- means the company-wide total; non-null rows are the per-creator attribution
-- cut (FieldVision signups whose intake referral_code matched that creator's
-- attribution_links code). NULLS NOT DISTINCT so the company-total row
-- upserts cleanly.

create table public.conversion_daily (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  creator_id uuid references public.profiles,
  day date not null,
  new_accounts int not null default 0,
  free_trials int not null default 0,
  sales_count int not null default 0,
  sales_cents int not null default 0,
  synced_at timestamptz not null default now(),
  unique nulls not distinct (company_id, day, creator_id)
);

create index conversion_daily_company_day_idx
  on public.conversion_daily (company_id, day);

alter table public.conversion_daily enable row level security;

-- Writes happen only through the service role in sync-conversions.
create policy "admins read conversion daily" on public.conversion_daily
  for select using (company_id = public.current_company_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Daily sync, half an hour before the 08:00 poll-metrics job so the
-- analytics tab wakes up with both sides of the chart fresh.

select cron.schedule(
  'noni-sync-conversions-daily',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/sync-conversions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
