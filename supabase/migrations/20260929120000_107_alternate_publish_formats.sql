-- A creator's posts for the day alternate format when they go out:
-- slideshow first, then a video, then a slideshow, and so on. Leftovers of
-- the more common format post last in slot order.

create or replace function public.assignment_publish_at(p_assignment_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select id, company_id, creator_id, scheduled_date
    from public.assignments
    where id = p_assignment_id
  ),
  formatted as (
    select a.id,
           a.slot_index,
           coalesce(b.format, 'video') <> 'photo_carousel' as is_video
    from public.assignments a
    join target t
      on a.company_id = t.company_id
     and a.creator_id = t.creator_id
     and a.scheduled_date = t.scheduled_date
    left join public.briefs b on b.id = a.brief_id
  ),
  ranked_within_format as (
    select f.*,
           row_number() over (partition by f.is_video order by f.slot_index, f.id) as format_rank
    from formatted f
  ),
  day as (
    select r.id,
           row_number() over (order by r.format_rank, r.is_video, r.slot_index, r.id) as rank,
           count(*) over () as total
    from ranked_within_format r
  )
  select (t.scheduled_date::timestamp + public.slot_publish_time(d.rank::int, d.total::int))
           at time zone 'America/New_York'
  from target t
  join day d on d.id = t.id;
$$;
