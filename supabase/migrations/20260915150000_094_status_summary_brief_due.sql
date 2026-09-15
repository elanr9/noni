-- 094: company_status_summary(): "to make" wording + brief_due for managers.
--
-- A campaign week starts on campaigns.drop_date and runs seven days. For
-- campaign_manager / company_admin memberships, when the current week ends
-- within two days (or has already ended) and no later campaign or
-- weekly_batches row exists, the company needs next week's brief: waiting + 1,
-- brief_due = true, line gets "next week not planned".

drop function if exists public.company_status_summary();

create function public.company_status_summary()
returns table (
  company_id uuid,
  name text,
  logo_path text,
  role text,
  is_active boolean,
  waiting integer,
  line text,
  fix integer,
  unread integer,
  shoot integer,
  review integer,
  brief_due boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active uuid := public.current_company_id();
  m record;
  v_today date;
  v_current_drop date;
  v_fix integer;
  v_unread integer;
  v_shoot integer;
  v_review integer;
  v_brief_due boolean;
  v_parts text[];
begin
  for m in
    select c.id, c.name, c.logo_path, cm.role
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.profile_id = v_uid
      and cm.removed_at is null
    order by (c.id = v_active) desc, c.name asc
  loop
    v_fix := 0;
    v_shoot := 0;
    v_review := 0;
    v_brief_due := false;
    v_unread := public.unread_inbox_count_for(m.id);
    v_parts := '{}';
    v_today := public.company_local_date(m.id);

    if m.role = 'creator' then
      select count(*) into v_fix
      from public.assignments a
      where a.company_id = m.id
        and a.creator_id = v_uid
        and a.status = 'changes_requested';

      select count(*) into v_shoot
      from public.assignments a
      where a.company_id = m.id
        and a.creator_id = v_uid
        and a.status = 'assigned'
        and a.scheduled_date = v_today;

      if v_fix > 0 then v_parts := v_parts || (v_fix || ' to fix'); end if;
      if v_unread > 0 then v_parts := v_parts || (v_unread || ' unread'); end if;
      if cardinality(v_parts) = 0 then v_parts := array['Caught up']; end if;
      if v_shoot > 0 then v_parts := v_parts || (v_shoot || ' to make'); end if;
    else
      select
        (select count(*) from public.assignments a
          where a.company_id = m.id and a.status = 'submitted')
        + (select count(*) from public.assignments a
          where a.company_id = m.id
            and a.music_marked_by_creator_at is not null
            and a.music_approved_at is null
            and a.status in ('approved', 'posted'))
        + (select count(*) from public.creator_accounts ca
          where ca.company_id = m.id and ca.status = 'pending')
      into v_review;

      -- Current week: latest published campaign that has started.
      select c.drop_date into v_current_drop
      from public.campaigns c
      where c.company_id = m.id
        and c.status = 'published'
        and c.drop_date is not null
        and c.drop_date <= v_today
      order by c.drop_date desc
      limit 1;

      if v_current_drop is not null
         and (v_current_drop + 6) - v_today <= 2
         and not exists (
           select 1 from public.campaigns c
           where c.company_id = m.id
             and c.drop_date > v_current_drop
         )
         and not exists (
           select 1 from public.weekly_batches b
           where b.company_id = m.id
             and b.week_start > v_current_drop
         ) then
        v_brief_due := true;
      end if;

      if v_review > 0 then v_parts := v_parts || (v_review || ' to review'); end if;
      if v_unread > 0 then v_parts := v_parts || (v_unread || ' unread'); end if;
      if v_brief_due then v_parts := v_parts || 'next week not planned'::text; end if;
      if cardinality(v_parts) = 0 then v_parts := array['Caught up']; end if;
    end if;

    company_id := m.id;
    name := m.name;
    logo_path := m.logo_path;
    role := m.role;
    is_active := m.id = v_active;
    fix := v_fix;
    unread := v_unread;
    shoot := v_shoot;
    review := v_review;
    brief_due := v_brief_due;
    waiting := v_fix + v_unread + v_review + case when v_brief_due then 1 else 0 end;
    line := array_to_string(v_parts, ', ');
    return next;
  end loop;
end;
$$;

grant execute on function public.company_status_summary() to authenticated;
