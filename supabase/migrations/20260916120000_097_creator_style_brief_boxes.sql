-- One text look per post. A creator's color pick applies to every text box
-- on every clip or slide of the brief, so no post mixes classic outlined
-- letters with colored bubbles. Same guards as creator_style_segment_box.

create or replace function public.creator_style_brief_boxes(
  p_brief_id uuid,
  p_color text,
  p_bg boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_segment record;
  v_style jsonb;
  v_boxes jsonb;
begin
  select company_id into v_company from public.briefs where id = p_brief_id;
  if not found then
    raise exception 'brief not found';
  end if;
  if v_company <> public.current_company_id() then
    raise exception 'forbidden';
  end if;
  if not exists (
    select 1 from public.assignments a
    where a.brief_id = p_brief_id
      and a.creator_id = auth.uid()
      and a.status in ('assigned', 'recorded', 'changes_requested')
  ) then
    raise exception 'not assigned to this brief';
  end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid color';
  end if;
  if p_bg is null then
    raise exception 'invalid bg';
  end if;

  for v_segment in
    select id, overlay_style from public.brief_segments where brief_id = p_brief_id
  loop
    v_style := coalesce(v_segment.overlay_style, '{}'::jsonb);
    if jsonb_typeof(v_style -> 'boxes') = 'array' then
      select coalesce(jsonb_agg(b || jsonb_build_object('color', p_color, 'bg', p_bg) order by ord), '[]'::jsonb)
        into v_boxes
        from jsonb_array_elements(v_style -> 'boxes') with ordinality as t(b, ord);
      v_style := v_style || jsonb_build_object('boxes', v_boxes, 'color', p_color, 'bg', p_bg);
    elsif v_style ? 'color' or v_style ? 'bg' then
      v_style := v_style || jsonb_build_object('color', p_color, 'bg', p_bg);
    else
      continue;
    end if;
    update public.brief_segments set overlay_style = v_style where id = v_segment.id;
  end loop;
end;
$$;

revoke all on function public.creator_style_brief_boxes(uuid, text, boolean) from public;
grant execute on function public.creator_style_brief_boxes(uuid, text, boolean) to authenticated;
