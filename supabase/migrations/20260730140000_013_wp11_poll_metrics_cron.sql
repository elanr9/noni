-- WP11: daily poll-metrics cron (Upload-Post analytics → post_metrics + bounty credit).
-- Auth: x-cron-secret from Vault (same secret as WP8 jobs).

select cron.schedule(
  'noni-poll-metrics-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/poll-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
