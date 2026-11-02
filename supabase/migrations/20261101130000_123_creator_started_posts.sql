-- Creator-started posts (v2 Create tab, Briefs, slideshow maker, Record):
-- a creator picks a library brief or films freely, so there is no
-- manager-made assignment to submit against. This function makes the brief
-- row and the assignment for the signed-in creator in one step; the existing
-- submission path (submissions insert, status hops, render) then applies.
create or replace function public.start_creator_post(
  p_company_id uuid,
  p_title text,
  p_format text,
  p_library_brief_id text default null
) returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
  v_row public.assignments;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not public.is_member_of(p_company_id) then
    raise exception 'not a member of this company';
  end if;
  if p_format not in ('video', 'photo_carousel') then
    raise exception 'format must be video or photo_carousel';
  end if;

  insert into public.briefs (company_id, created_by, title, format)
  values (p_company_id, auth.uid(), coalesce(nullif(trim(p_title), ''), 'New post'), p_format)
  returning id into v_brief_id;

  insert into public.assignments (company_id, brief_id, library_brief_id, creator_id, scheduled_date, status)
  values (p_company_id, v_brief_id, p_library_brief_id, auth.uid(), current_date, 'assigned')
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.start_creator_post(uuid, text, text, text) from public;
grant execute on function public.start_creator_post(uuid, text, text, text) to authenticated;
