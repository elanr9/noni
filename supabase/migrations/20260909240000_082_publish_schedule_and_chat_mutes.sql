-- Scheduled posting, manager "creator behind" reminders, and chat mutes.
--
-- 1. Approve no longer posts. It stamps assignments.publish_at from the
--    creator's slot layout for that day (America/New_York): one post posts at
--    12:00; two post at 12:00 and 18:00; three post at 10:00, 14:00, 19:00.
--    publish-due (cron, every 5 minutes) claims due rows and posts them.
-- 2. creator_reminders gains kind 'creator_behind' (manager-side push).
-- 3. chat_mutes: per profile mute of a manager chat or a creator DM thread.

-- 1. Scheduled posting ------------------------------------------------------

alter table public.assignments
  add column if not exists publish_at timestamptz,
  add column if not exists publish_claimed_at timestamptz,
  add column if not exists publish_error text;

create index if not exists assignments_publish_due_idx
  on public.assignments (publish_at)
  where status = 'approved' and publish_claimed_at is null;

create or replace function public.slot_publish_time(p_rank int, p_total int)
returns interval
language sql
immutable
as $$
  select case
    when p_total <= 1 then interval '12 hours'
    when p_total = 2 then case when p_rank <= 1 then interval '12 hours' else interval '18 hours' end
    else case
      when p_rank <= 1 then interval '10 hours'
      when p_rank = 2 then interval '14 hours'
      else interval '19 hours'
    end
  end;
$$;

-- Slot time for one assignment given every post the creator has that day.
create or replace function public.assignment_publish_at(p_assignment_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select id, creator_id, scheduled_date
    from public.assignments
    where id = p_assignment_id
  ),
  day as (
    select a.id,
           row_number() over (order by a.slot_index, a.id) as rank,
           count(*) over () as total
    from public.assignments a
    join target t on a.creator_id = t.creator_id and a.scheduled_date = t.scheduled_date
  )
  select (t.scheduled_date::timestamp + public.slot_publish_time(d.rank::int, d.total::int))
           at time zone 'America/New_York'
  from target t
  join day d on d.id = t.id;
$$;

-- Called by the app right after Approve. A slot already in the past posts on
-- the next cron tick.
create or replace function public.schedule_assignment_publish(p_assignment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publish_at timestamptz;
begin
  if not public.is_campaign_manager() then
    raise exception 'forbidden';
  end if;
  update public.assignments
  set publish_at = greatest(now(), public.assignment_publish_at(id)),
      publish_claimed_at = null,
      publish_error = null
  where id = p_assignment_id
    and company_id = public.current_company_id()
    and status = 'approved'
  returning publish_at into v_publish_at;
  return v_publish_at;
end;
$$;

grant execute on function public.schedule_assignment_publish(uuid) to authenticated;

select cron.schedule(
  'noni-publish-due',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/publish-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- 2. Manager-side behind reminders -----------------------------------------

alter table public.creator_reminders drop constraint if exists creator_reminders_kind_check;
alter table public.creator_reminders
  add constraint creator_reminders_kind_check
  check (kind in ('due_today', 'overdue', 'creator_behind'));

-- 3. Chat mutes -------------------------------------------------------------

create table if not exists public.chat_mutes (
  profile_id uuid not null references public.profiles on delete cascade,
  company_id uuid not null references public.companies on delete cascade,
  chat_id    uuid references public.manager_chats on delete cascade,
  creator_id uuid references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  check ((chat_id is not null) <> (creator_id is not null)),
  unique nulls not distinct (profile_id, chat_id, creator_id)
);

alter table public.chat_mutes enable row level security;

create policy "own chat mutes" on public.chat_mutes
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and company_id = public.current_company_id());

grant select, insert, delete on public.chat_mutes to authenticated;
grant all on public.chat_mutes to service_role;
