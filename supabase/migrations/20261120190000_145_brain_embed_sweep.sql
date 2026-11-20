-- The company brain's vectors are made by the brain-embed function, a text at
-- a time, each request handing on to the next. That chain is best effort: a
-- worker killed at its CPU limit or a dropped hand-off ends it, and whatever
-- was still waiting would then wait until something else happened to start a
-- new chain. This job makes it certain. Every two minutes it asks brain-embed
-- to start a chain for each company that still has a passage or a live record
-- without a vector. With nothing waiting it is one cheap request.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'noni-brain-embed-sweep') then
    perform cron.unschedule('noni-brain-embed-sweep');
  end if;
end;
$$;

select cron.schedule(
  'noni-brain-embed-sweep',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/brain-embed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"sweep":true}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
