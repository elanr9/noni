-- Streak rewards: 3d/$20, 10d/$100, 31d/$300.
-- Count a scheduled day only when every assignment that day is submitted,
-- approved, or posted. Wire assignments (primary) and keep content_tasks
-- (legacy). Bonuses still credit wallet_ledger kind = streak_bonus.

update public.companies
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'streak_milestones', jsonb_build_array(
    jsonb_build_object('days', 3, 'amount_cents', 2000),
    jsonb_build_object('days', 10, 'amount_cents', 10000),
    jsonb_build_object('days', 31, 'amount_cents', 30000)
  )
);

-- Exact-day bonus; largest milestone also repeats at multiples (62, 93, …).
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

-- True when every post due on p_day for this creator is done (submitted+).
create or replace function public.streak_day_complete(
  p_company uuid,
  p_creator uuid,
  p_day date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_total int;
  v_done int;
begin
  select
    count(*),
    count(*) filter (
      where status in ('submitted', 'approved', 'posted')
    )
  into v_total, v_done
  from public.assignments
  where company_id = p_company
    and creator_id = p_creator
    and scheduled_date = p_day;

  if v_total > 0 then
    return v_done = v_total;
  end if;

  -- Legacy content_tasks path when no assignments exist for the day.
  select
    count(*),
    count(*) filter (
      where status in ('submitted', 'approved', 'posted')
    )
  into v_total, v_done
  from public.content_tasks
  where company_id = p_company
    and assigned_to = p_creator
    and coalesce(due_date, scheduled_for) = p_day;

  if v_total = 0 then
    return false;
  end if;
  return v_done = v_total;
end
$fn$;

revoke execute on function public.streak_day_complete(uuid, uuid, date)
  from public, anon, authenticated;

-- Scheduled days after p_after and before p_before that still have unfinished work.
create or replace function public.streak_missed_days(
  p_company uuid,
  p_creator uuid,
  p_after date,
  p_before date
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_missed int;
begin
  with days as (
    select distinct scheduled_date as d
    from public.assignments
    where company_id = p_company
      and creator_id = p_creator
      and scheduled_date > p_after
      and scheduled_date < p_before
    union
    select distinct coalesce(due_date, scheduled_for) as d
    from public.content_tasks
    where company_id = p_company
      and assigned_to = p_creator
      and coalesce(due_date, scheduled_for) > p_after
      and coalesce(due_date, scheduled_for) < p_before
  )
  select count(*) into v_missed
  from days
  where d is not null
    and not public.streak_day_complete(p_company, p_creator, d);

  return coalesce(v_missed, 0);
end
$fn$;

revoke execute on function public.streak_missed_days(uuid, uuid, date, date)
  from public, anon, authenticated;

-- Old overload returned void; drop before recreating with jsonb.
drop function if exists public.record_streak_approval(uuid, uuid);

-- Advance streak for a completed scheduled day. Locks the streak row.
-- Returns jsonb: { streak, bonus_cents, near_milestone_days, near_milestone_cents }
create or replace function public.record_streak_approval(
  p_company uuid,
  p_creator uuid,
  p_day date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_settings jsonb;
  v_day date;
  v_row public.creator_streaks%rowtype;
  v_missed int;
  v_streak int;
  v_grace_used_on date;
  v_bonus_cents int;
  v_milestones jsonb;
  v_item jsonb;
  v_near_days int := null;
  v_near_cents int := null;
  v_m_days int;
  v_m_cents int;
begin
  -- Authenticated callers may only advance their own streak (or admin).
  if auth.uid() is not null then
    if auth.uid() <> p_creator and not public.is_admin() then
      raise exception 'forbidden';
    end if;
    if public.current_company_id() is distinct from p_company then
      raise exception 'forbidden';
    end if;
  end if;

  select coalesce(settings, '{}'::jsonb) into v_settings
  from public.companies where id = p_company;

  v_day := coalesce(
    p_day,
    (now() at time zone coalesce(v_settings->>'timezone', 'America/Chicago'))::date
  );

  if not public.streak_day_complete(p_company, p_creator, v_day) then
    return jsonb_build_object('streak', 0, 'bonus_cents', 0, 'counted', false);
  end if;

  insert into public.creator_streaks (company_id, creator_id)
  values (p_company, p_creator)
  on conflict (company_id, creator_id) do nothing;

  select * into v_row from public.creator_streaks
  where company_id = p_company and creator_id = p_creator
  for update;

  if v_row.last_counted_date = v_day then
    return jsonb_build_object(
      'streak', v_row.current_streak,
      'bonus_cents', 0,
      'counted', false
    );
  end if;

  v_grace_used_on := v_row.grace_used_on;

  if v_row.last_counted_date is null or v_row.current_streak = 0 then
    v_streak := 1;
  else
    v_missed := public.streak_missed_days(
      p_company, p_creator, v_row.last_counted_date, v_day
    );

    if v_missed = 0 then
      v_streak := v_row.current_streak + 1;
    elsif v_missed = 1
      and (v_grace_used_on is null or v_grace_used_on < v_day - 30) then
      v_streak := v_row.current_streak + 1;
      v_grace_used_on := v_day;
    else
      v_streak := 1;
    end if;
  end if;

  update public.creator_streaks set
    current_streak = v_streak,
    longest_streak = greatest(longest_streak, v_streak),
    last_counted_date = v_day,
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

  -- One day shy of the next configured milestone (for progress pushes).
  v_milestones := coalesce(v_settings->'streak_milestones', '[]'::jsonb);
  if jsonb_typeof(v_milestones) = 'array' then
    for v_item in select jsonb_array_elements(v_milestones) loop
      v_m_days := coalesce((v_item->>'days')::int, 0);
      v_m_cents := coalesce((v_item->>'amount_cents')::int, 0);
      if v_m_days = v_streak + 1 and v_m_cents > 0 then
        v_near_days := v_m_days;
        v_near_cents := v_m_cents;
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'streak', v_streak,
    'bonus_cents', v_bonus_cents,
    'counted', true,
    'near_milestone_days', v_near_days,
    'near_milestone_cents', v_near_cents
  );
end
$fn$;

revoke execute on function public.record_streak_approval(uuid, uuid, date)
  from public, anon;
grant execute on function public.record_streak_approval(uuid, uuid, date)
  to authenticated, service_role;

-- Streak advances from transitionAssignment / transitionTask (so the app can
-- push on the return value). Drop the old content_tasks-only trigger.
drop trigger if exists content_tasks_streak on public.content_tasks;
drop trigger if exists assignments_streak on public.assignments;
drop function if exists public.handle_task_approved_streak();
drop function if exists public.handle_assignment_streak();

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

    v_missed := public.streak_missed_days(
      r.company_id, r.creator_id, r.last_counted_date, v_today
    );

    v_grace_available :=
      r.grace_used_on is null or r.grace_used_on < v_today - 30;

    if v_missed >= 2 or (v_missed = 1 and not v_grace_available) then
      update public.creator_streaks set current_streak = 0 where id = r.id;
    end if;
  end loop;
end
$fn$;

revoke execute on function public.reset_broken_streaks() from public, anon, authenticated;
