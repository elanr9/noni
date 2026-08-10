-- Creator due-today / overdue morning push reminders.
-- Claim table is per creator+kind+day so one aggregate push fires even when
-- a creator has many incomplete assignments. Hourly cron at :15; the edge
-- function only acts in the 8–9 America/New_York hour (claim makes retries safe).

create table public.creator_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  creator_id uuid not null references public.profiles,
  kind text not null check (kind in ('due_today', 'overdue')),
  sent_on date not null,
  created_at timestamptz not null default now(),
  unique (company_id, creator_id, kind, sent_on)
);

create index creator_reminders_company_day_idx
  on public.creator_reminders (company_id, sent_on);

alter table public.creator_reminders enable row level security;

create policy "admins read creator reminders" on public.creator_reminders
  for select using (company_id = public.current_company_id() and public.is_admin());

grant select on public.creator_reminders to anon, authenticated, service_role;
grant insert on public.creator_reminders to service_role;

select cron.schedule(
  'noni-notify-reminders-hourly',
  '15 * * * *',
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
