-- Per-slot "it's time" pushes and one 4pm nudge if posts are still open.
-- notify-reminders claims these kinds. Cron also fires at :00 so slot hours
-- (10, 12, 14, 16, 18, 19 America/New_York) are not 15 minutes late.

alter table public.creator_reminders drop constraint if exists creator_reminders_kind_check;
alter table public.creator_reminders
  add constraint creator_reminders_kind_check
  check (kind in (
    'due_today',
    'overdue',
    'creator_behind',
    'account_warmup',
    'slot_0',
    'slot_1',
    'slot_2',
    'afternoon_nudge',
    'posts_ready'
  ));

do $$
begin
  if exists (select 1 from cron.job where jobname = 'noni-notify-reminders-hourly') then
    perform cron.unschedule('noni-notify-reminders-hourly');
  end if;
end;
$$;

select cron.schedule(
  'noni-notify-reminders-hourly',
  '0,15 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/notify-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
