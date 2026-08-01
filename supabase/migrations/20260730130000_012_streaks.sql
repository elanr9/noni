-- Streaks: consecutive scheduled days with at least one approved task.
-- A day counts when a task flips to 'approved'. Rest days (no task due) are
-- skipped. One grace miss per 30 days keeps the streak alive. Milestone
-- bonuses credit the wallet ledger (kind = streak_bonus).

create table public.creator_streaks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  creator_id uuid not null references public.profiles,
  current_streak int not null default 0 check (current_streak >= 0),
  longest_streak int not null default 0 check (longest_streak >= 0),
  last_counted_date date,
  grace_used_on date,
  unique (company_id, creator_id)
);

alter table public.creator_streaks enable row level security;

create policy "admins read streaks" on public.creator_streaks for select
  using (company_id = public.current_company_id() and public.is_admin());

create policy "creators read own streak" on public.creator_streaks for select
  using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

grant select on public.creator_streaks to anon, authenticated;
grant select, insert, update, delete on public.creator_streaks to service_role;

-- New ledger kind for streak payouts.
alter table public.wallet_ledger drop constraint wallet_ledger_kind_check;
alter table public.wallet_ledger add constraint wallet_ledger_kind_check
  check (kind in (
    'bounty_credit', 'streak_bonus', 'payout_hold', 'payout_paid',
    'payout_failed', 'adjustment'
  ));

-- Milestone defaults; 30-day amount repeats every further 30 days.
update public.companies
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'streak_milestones', jsonb_build_array(
    jsonb_build_object('days', 7, 'amount_cents', 1000),
    jsonb_build_object('days', 14, 'amount_cents', 2500),
    jsonb_build_object('days', 30, 'amount_cents', 7500)
  )
)
where settings->'streak_milestones' is null;

-- Bonus for reaching exactly p_days, from company settings. The largest
-- milestone repeats at every multiple (60, 90, ... for a 30-day milestone).
create or replace function public.streak_bonus_cents(p_days int, p_settings jsonb)
returns int
language plpgsql
immutable
as $fn$
declare
  v_milestones jsonb := coalesce(p_settings->'streak_milestones', '[]'::jsonb);
  v_item jsonb;
  v_days int;
  v_amount int;
  v_last_days int := 0;
  v_last_amount int := 0;
begin
  if jsonb_typeof(v_milestones) <> 'array' then
    return 0;
  end if;
  for v_item in select jsonb_array_elements(v_milestones) loop
    v_days := coalesce((v_item->>'days')::int, 0);
    v_amount := coalesce((v_item->>'amount_cents')::int, 0);
    if v_days <= 0 or v_amount <= 0 then
      continue;
    end if;
    if v_days = p_days then
      return v_amount;
    end if;
    if v_days > v_last_days then
      v_last_days := v_days;
      v_last_amount := v_amount;
    end if;
  end loop;
  if v_last_days > 0 and p_days > v_last_days and p_days % v_last_days = 0 then
    return v_last_amount;
  end if;
  return 0;
end
$fn$;

-- Advance the streak for one creator after an approval. Locks the streak row
-- so two same-day approvals cannot double count or double pay.
create or replace function public.record_streak_approval(p_company uuid, p_creator uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_settings jsonb;
  v_today date;
  v_row public.creator_streaks%rowtype;
  v_missed int;
  v_streak int;
  v_grace_used_on date;
  v_bonus_cents int;
begin
  select coalesce(settings, '{}'::jsonb) into v_settings
  from public.companies where id = p_company;

  v_today := (now() at time zone coalesce(v_settings->>'timezone', 'America/Chicago'))::date;

  insert into public.creator_streaks (company_id, creator_id)
  values (p_company, p_creator)
  on conflict (company_id, creator_id) do nothing;

  select * into v_row from public.creator_streaks
  where company_id = p_company and creator_id = p_creator
  for update;

  if v_row.last_counted_date = v_today then
    return;
  end if;

  v_grace_used_on := v_row.grace_used_on;

  if v_row.last_counted_date is null or v_row.current_streak = 0 then
    v_streak := 1;
  else
    -- Scheduled days between the last counted day and today with no approval.
    select count(distinct due_date) into v_missed
    from public.content_tasks
    where company_id = p_company
      and assigned_to = p_creator
      and due_date > v_row.last_counted_date
      and due_date < v_today;

    if v_missed = 0 then
      v_streak := v_row.current_streak + 1;
    elsif v_missed = 1
      and (v_grace_used_on is null or v_grace_used_on < v_today - 30) then
      v_streak := v_row.current_streak + 1;
      v_grace_used_on := v_today;
    else
      v_streak := 1;
    end if;
  end if;

  update public.creator_streaks set
    current_streak = v_streak,
    longest_streak = greatest(longest_streak, v_streak),
    last_counted_date = v_today,
    grace_used_on = v_grace_used_on
  where id = v_row.id;

  v_bonus_cents := public.streak_bonus_cents(v_streak, v_settings);
  if v_bonus_cents > 0 then
    insert into public.creator_wallets (company_id, creator_id)
    values (p_company, p_creator)
    on conflict (company_id, creator_id) do nothing;

    insert into public.wallet_ledger (company_id, creator_id, kind, amount_cents, note)
    values (
      p_company, p_creator, 'streak_bonus', v_bonus_cents,
      v_streak || ' day streak bonus'
    );

    update public.creator_wallets
    set available_cents = available_cents + v_bonus_cents
    where company_id = p_company and creator_id = p_creator;
  end if;
end
$fn$;

revoke execute on function public.record_streak_approval(uuid, uuid) from public, anon, authenticated;

create or replace function public.handle_task_approved_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status = 'approved'
    and old.status is distinct from 'approved'
    and new.assigned_to is not null then
    perform public.record_streak_approval(new.company_id, new.assigned_to);
  end if;
  return new;
end
$fn$;

create trigger content_tasks_streak
  after update of status on public.content_tasks
  for each row execute function public.handle_task_approved_streak();

-- Zero out streaks broken by missed scheduled days so the UI never shows a
-- stale streak. A single miss with grace available survives (grace is
-- consumed by the next approval).
create or replace function public.reset_broken_streaks()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_today date;
  v_missed int;
  v_grace_available boolean;
begin
  for r in
    select s.id, s.company_id, s.creator_id, s.last_counted_date, s.grace_used_on,
           coalesce(c.settings, '{}'::jsonb) as settings
    from public.creator_streaks s
    join public.companies c on c.id = s.company_id
    where s.current_streak > 0
  loop
    v_today := (now() at time zone coalesce(r.settings->>'timezone', 'America/Chicago'))::date;

    select count(distinct due_date) into v_missed
    from public.content_tasks
    where company_id = r.company_id
      and assigned_to = r.creator_id
      and due_date > r.last_counted_date
      and due_date < v_today;

    v_grace_available :=
      r.grace_used_on is null or r.grace_used_on < v_today - 30;

    if v_missed >= 2 or (v_missed = 1 and not v_grace_available) then
      update public.creator_streaks set current_streak = 0 where id = r.id;
    end if;
  end loop;
end
$fn$;

revoke execute on function public.reset_broken_streaks() from public, anon, authenticated;

-- Daily reset, after auto-fill (07:00 UTC) has created today's tasks.
select cron.schedule(
  'noni-reset-streaks-daily',
  '30 8 * * *',
  'select public.reset_broken_streaks();'
);
