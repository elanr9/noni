-- Publish scheduling hardening: a shared slot picker behind both the manager
-- facing scheduler and a service role only scheduler that publish-due uses to
-- defer and retry. Cross creator gap widens from 10 to 20 minutes so two
-- creators in one company can never land inside a single 5 minute cron tick.
-- publish_attempts caps Upload-Post retries at three.

alter table public.assignments
  add column if not exists publish_attempts int not null default 0;

comment on column public.assignments.publish_attempts is
  'Times publish-due has claimed this row and called post-approved. Capped at 3 before a manager must step in.';

-- Picks a random next day ET slot (9am to 9pm) at least 90 minutes from the
-- creator's other posts and 20 minutes from any other post in the company.
-- Does not write; callers own the update. Tries 30 candidates and settles
-- for the last one when every attempt collides.
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
        and a.status in ('approved', 'posted')
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

revoke all on function public.pick_assignment_publish_slot(uuid, uuid, uuid, date)
  from public, anon, authenticated;

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
  v_candidate timestamptz;
begin
  if not public.is_campaign_manager() then
    raise exception 'forbidden';
  end if;

  select creator_id, company_id, scheduled_date
    into v_creator, v_company, v_scheduled
  from public.assignments
  where id = p_assignment_id
    and company_id = public.current_company_id()
    and status = 'approved';
  if not found then
    return null;
  end if;

  v_candidate := public.pick_assignment_publish_slot(p_assignment_id, v_company, v_creator, v_scheduled);

  update public.assignments
  set publish_at = v_candidate,
      publish_claimed_at = null,
      publish_error = null
  where id = p_assignment_id
    and company_id = v_company;
  return v_candidate;
end;
$$;

-- Service role only: publish-due defers and retries through this. No tenant
-- filter because the caller is the cron sweep, not a user session.
create or replace function public.schedule_assignment_publish_system(p_assignment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator   uuid;
  v_company   uuid;
  v_scheduled date;
  v_candidate timestamptz;
begin
  select creator_id, company_id, scheduled_date
    into v_creator, v_company, v_scheduled
  from public.assignments
  where id = p_assignment_id
    and status = 'approved';
  if not found then
    return null;
  end if;

  v_candidate := public.pick_assignment_publish_slot(p_assignment_id, v_company, v_creator, v_scheduled);

  update public.assignments
  set publish_at = v_candidate,
      publish_claimed_at = null,
      publish_error = null
  where id = p_assignment_id
    and company_id = v_company;
  return v_candidate;
end;
$$;

revoke all on function public.schedule_assignment_publish_system(uuid)
  from public, anon, authenticated;
grant execute on function public.schedule_assignment_publish_system(uuid) to service_role;
