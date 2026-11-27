-- 177: the daily automatic Scout search needs a wake up of its own.
-- noni-scout-tick only calls the function while a search is running, so the
-- function never got the chance to start the day's automatic ones. This calls
-- it once an hour; the function decides which companies are due (one small
-- search a day for a company that searched in the last 30 days).

select cron.unschedule('noni-scout-auto') where exists (select 1 from cron.job where jobname = 'noni-scout-auto');
select cron.schedule(
  'noni-scout-auto',
  '7 * * * *',
  $cron$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/scout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $cron$
);
