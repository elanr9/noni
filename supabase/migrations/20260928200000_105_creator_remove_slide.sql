-- A creator can drop a slide from a slideshow on their own assignment (for
-- example a duplicated talking point). The remaining slides close the gap.

create or replace function public.creator_remove_slide(p_segment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment public.brief_segments%rowtype;
begin
  select * into v_segment from public.brief_segments where id = p_segment_id;
  if not found then
    raise exception 'segment not found';
  end if;
  if v_segment.kind <> 'slide' then
    raise exception 'only slides can be removed';
  end if;
  if v_segment.company_id <> public.current_company_id() then
    raise exception 'forbidden';
  end if;
  if not exists (
    select 1 from public.assignments a
    where a.brief_id = v_segment.brief_id
      and a.creator_id = auth.uid()
      and a.status in ('assigned', 'recorded', 'changes_requested')
  ) then
    raise exception 'not assigned to this brief';
  end if;
  if (select count(*) from public.brief_segments s
      where s.brief_id = v_segment.brief_id and s.kind = 'slide') <= 1 then
    raise exception 'a slideshow needs at least one slide';
  end if;

  delete from public.brief_segments where id = p_segment_id;

  update public.brief_segments s
    set slot_index = s.slot_index - 1
    where s.brief_id = v_segment.brief_id
      and s.kind = 'slide'
      and s.slot_index > v_segment.slot_index;
end;
$$;

revoke all on function public.creator_remove_slide(uuid) from public;
grant execute on function public.creator_remove_slide(uuid) to authenticated;
