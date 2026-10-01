-- Per-creator caption. Every creator on a brief used to post the brief's
-- caption word for word at the same minute, which TikTok reads as a bot
-- network. vary-copy writes a distinct caption per assignment here and a
-- reworded overlay per segment into assignment_segment_edits; post-approved
-- prefers this over briefs.caption.
alter table public.assignments add column if not exists caption text;

comment on column public.assignments.caption is
  'This creator''s own wording of the brief caption (vary-copy). Null falls back to briefs.caption.';

-- Approve schedules the post for a random time the next day (ET, 9am to
-- 9pm), never today, at least 90 minutes from this creator's other posts and
-- at least 10 minutes from anyone else's in the company. A brief scheduled
-- further out keeps its own day. Fixed slot times are retired.
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
  v_day       date;
  v_candidate timestamptz;
  v_attempt   int := 0;
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

  v_day := greatest((now() at time zone 'America/New_York')::date + 1, v_scheduled);

  loop
    v_candidate := (v_day::timestamp + interval '9 hours' + random() * interval '12 hours')
                   at time zone 'America/New_York';
    exit when v_attempt >= 30 or not exists (
      select 1
      from public.assignments a
      where a.company_id = v_company
        and a.id <> p_assignment_id
        and a.publish_at is not null
        and a.status in ('approved', 'posted')
        and (
          (a.creator_id = v_creator
             and abs(extract(epoch from (a.publish_at - v_candidate))) < 90 * 60)
          or abs(extract(epoch from (a.publish_at - v_candidate))) < 10 * 60
        )
    );
    v_attempt := v_attempt + 1;
  end loop;

  update public.assignments
  set publish_at = v_candidate,
      publish_claimed_at = null,
      publish_error = null
  where id = p_assignment_id;
  return v_candidate;
end;
$$;
