-- Creators may recolor the manager's text boxes on a clip or slide: classic
-- outlined letters (bg false) or a TikTok colored bubble (bg true). Color and
-- bg only; text, size and position stay as set. Same guards as
-- creator_place_segment.

create or replace function public.creator_style_segment_box(
  p_segment_id uuid,
  p_box_id text,
  p_color text,
  p_bg boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment public.brief_segments%rowtype;
  v_style jsonb;
  v_boxes jsonb;
begin
  select * into v_segment from public.brief_segments where id = p_segment_id;
  if not found then
    raise exception 'segment not found';
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
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid color';
  end if;
  if p_bg is null then
    raise exception 'invalid bg';
  end if;

  v_style := coalesce(v_segment.overlay_style, '{}'::jsonb);

  if jsonb_typeof(v_style -> 'boxes') = 'array' then
    select coalesce(jsonb_agg(
      case when b ->> 'id' = p_box_id
        then b || jsonb_build_object('color', p_color, 'bg', p_bg)
        else b
      end
      order by ord), '[]'::jsonb)
    into v_boxes
    from jsonb_array_elements(v_style -> 'boxes') with ordinality as t(b, ord);
    v_style := v_style || jsonb_build_object('boxes', v_boxes);
    if (v_boxes -> 0 ->> 'id') = p_box_id then
      v_style := v_style || jsonb_build_object('color', p_color, 'bg', p_bg);
    end if;
  elsif p_box_id = 'legacy-0' then
    v_style := v_style || jsonb_build_object('color', p_color, 'bg', p_bg);
  else
    return;
  end if;

  update public.brief_segments
    set overlay_style = v_style
    where id = p_segment_id;
end;
$$;

revoke all on function public.creator_style_segment_box(uuid, text, text, boolean) from public;
grant execute on function public.creator_style_segment_box(uuid, text, text, boolean) to authenticated;
