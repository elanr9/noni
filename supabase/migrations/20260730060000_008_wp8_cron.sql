-- WP8: schedule the UGC brain.
-- The cron jobs call edge functions with an x-cron-secret header. The secret
-- value lives in Vault under the name 'cron_secret' (inserted out of band,
-- never committed) and must match the CRON_SECRET edge function secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- scrape-trends: weekly, Monday 06:00 UTC
select cron.schedule(
  'noni-scrape-trends-weekly',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/scrape-trends',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- auto-fill: daily, 07:00 UTC
select cron.schedule(
  'noni-auto-fill-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/auto-fill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- brand-ingest refresh: monthly, 1st at 05:00 UTC
select cron.schedule(
  'noni-brand-ingest-monthly',
  '0 5 1 * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/brand-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
