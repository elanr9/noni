-- Agent 4: publish scheduling. Published before Sunday 8PM EST notifies at
-- Sunday 8PM EST; published after notifies immediately. publish-campaign sets
-- notify_at from campaign_notify_at(drop_date); an hourly cron sweeps due
-- campaigns through notify-scheduled, which claims via notified_at.

alter table public.campaigns
  add column notify_at   timestamptz,
  add column notified_at timestamptz;

-- 8PM New York on the drop date, DST-aware: the naive timestamp is
-- interpreted as America/New_York local time and returned as timestamptz.
create or replace function public.campaign_notify_at(p_drop_date date)
returns timestamptz
language sql
stable
as $$
  select (p_drop_date::timestamp + interval '20 hours') at time zone 'America/New_York';
$$;

-- Hourly sweep at :05 so an 8PM ET notify_at is already due when it runs.
select cron.schedule(
  'noni-notify-scheduled-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
