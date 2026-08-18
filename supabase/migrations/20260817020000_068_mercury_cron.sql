-- Mercury payout schedule. Retires the Stripe weekly run.
--
-- Same shape as 008_wp8_cron.sql: pg_cron calls the edge function over pg_net
-- with the shared secret read from Vault, and the function decides whether it
-- is actually inside its window. pg_cron speaks UTC while payouts are an
-- Eastern-time promise, so a fixed UTC hour would drift by one hour across
-- daylight saving twice a year. Firing hourly and gating in the function means
-- the schedule is correct year round with nothing to remember.
--
-- cron.schedule upserts on job name, so re-running this migration is safe.
--
-- NOTE: mercury-weekly-payouts stays dormant until the MERCURY_PAYOUTS_ENABLED
-- edge function secret is set to 'true'. Applying this migration schedules the
-- job but does not start paying anyone.

-- ---------------------------------------------------------------------------
-- Retire the Stripe run.
--
-- Unschedule rather than drop: weekly-payouts/index.ts is kept on disk for
-- rollback (Phase 7), and re-enabling it is one cron.schedule call. Guarded
-- because cron.unschedule raises if the job is already gone.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'noni-weekly-payouts') then
    perform cron.unschedule('noni-weekly-payouts');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payouts: hourly at :10, runs only Sunday 20:00-20:59 America/New_York.
-- 120s timeout matches the Stripe job — the run is sequential across creators.

select cron.schedule(
  'noni-mercury-weekly-payouts',
  '10 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/mercury-weekly-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Onboarding sweep: hourly at :05, runs only Saturday 15:00-15:59 ET.
--
-- The day before payouts, so a creator who finished Mercury onboarding but
-- never tapped "I'm done" is still picked up in time to be paid that week.
-- Mercury emits no recipient webhooks, so this poll is the only backstop.

select cron.schedule(
  'noni-mercury-onboarding-sweep',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/mercury-onboarding-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Token liveness: Mondays 12:00 UTC.
--
-- Mercury downgrades a token whose permissions exceed its usage over any
-- 45-day window and deletes one unused for 45 days, and a downgrade cannot be
-- undone — you have to mint a new token and re-whitelist the IP. A weekly read
-- keeps the write token exercised through quiet stretches. It runs on a plain
-- UTC schedule because nothing about it is time-of-day sensitive.

select cron.schedule(
  'noni-mercury-token-liveness',
  '0 12 * * 1',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/mercury-token-liveness',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
