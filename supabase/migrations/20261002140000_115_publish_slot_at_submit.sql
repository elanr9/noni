-- A post gets its publish slot the moment the creator submits it: a random
-- next day ET time (9am to 9pm), spaced from every other scheduled post in
-- the company, so the review queue can show when each one goes live. Approve
-- keeps that slot while it is still ahead and only re-picks a slot that has
-- already passed. Provisional slots count as taken when spacing new ones.

create or replace function public.pick_assignment_publish_slot(
  p_assignment_id uuid,
  p_company uuid,
  p_creator uuid,
  p_scheduled date
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day       date;
  v_candidate timestamptz;
  v_attempt   int := 0;
begin
  v_day := greatest((now() at time zone 'America/New_York')::date + 1, p_scheduled);
  loop
    v_candidate := (v_day::timestamp + interval '9 hours' + random() * interval '12 hours')
                   at time zone 'America/New_York';
    exit when v_attempt >= 30 or not exists (
      select 1
      from public.assignments a
      where a.company_id = p_company
        and a.id <> p_assignment_id
        and a.publish_at is not null
        and a.status in ('submitted', 'approved', 'posted')
        and (
          (a.creator_id = p_creator
             and abs(extract(epoch from (a.publish_at - v_candidate))) < 90 * 60)
          or abs(extract(epoch from (a.publish_at - v_candidate))) < 20 * 60
        )
    );
    v_attempt := v_attempt + 1;
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.assignments_slot_on_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted'
     and (old.status is distinct from 'submitted')
     and (new.publish_at is null or new.publish_at < now()) then
    new.publish_at := public.pick_assignment_publish_slot(
      new.id, new.company_id, new.creator_id, new.scheduled_date);
    new.publish_claimed_at := null;
    new.publish_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_slot_on_submit on public.assignments;
create trigger assignments_slot_on_submit
  before update of status on public.assignments
  for each row execute function public.assignments_slot_on_submit();

create or replace function public.schedule_assignment_publish(p_assignment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator   uuid;
  v_company   uuid;
  v_scheduled date;
  v_existing  timestamptz;
  v_candidate timestamptz;
begin
  if not public.is_campaign_manager() then
    raise exception 'forbidden';
  end if;

  select creator_id, company_id, scheduled_date, publish_at
    into v_creator, v_company, v_scheduled, v_existing
  from public.assignments
  where id = p_assignment_id
    and company_id = public.current_company_id()
    and status = 'approved';
  if not found then
    return null;
  end if;

  if v_existing is not null and v_existing > now() then
    v_candidate := v_existing;
  else
    v_candidate := public.pick_assignment_publish_slot(p_assignment_id, v_company, v_creator, v_scheduled);
  end if;

  update public.assignments
  set publish_at = v_candidate,
      publish_claimed_at = null,
      publish_error = null
  where id = p_assignment_id
    and company_id = v_company;
  return v_candidate;
end;
$$;

-- Posts already waiting in review get their slot now, one at a time so each
-- pick sees the slots handed out before it.
do $$
declare
  r record;
begin
  for r in
    select id, company_id, creator_id, scheduled_date
    from public.assignments
    where status = 'submitted' and publish_at is null
    order by created_at
  loop
    update public.assignments
    set publish_at = public.pick_assignment_publish_slot(r.id, r.company_id, r.creator_id, r.scheduled_date)
    where id = r.id;
  end loop;
end;
$$;
