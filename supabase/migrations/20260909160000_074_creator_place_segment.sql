-- Creators may nudge where the manager's text boxes and screenshot sit on a
-- clip or slide before it goes to review. Position only: text, color, size
-- and the screenshot itself stay exactly as the manager set them, which is
-- why this is a narrow RPC and not an update policy on brief_segments.

create or replace function public.creator_place_segment(
  p_segment_id uuid,
  p_box_id text default null,
  p_box_x double precision default null,
  p_box_y double precision default null,
  p_screenshot_x double precision default null,
  p_screenshot_y double precision default null
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
  v_x double precision;
  v_y double precision;
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

  if p_box_id is not null and p_box_x is not null and p_box_y is not null then
    v_x := least(0.98, greatest(0.02, p_box_x));
    v_y := least(0.98, greatest(0.02, p_box_y));
    v_style := coalesce(v_segment.overlay_style, '{}'::jsonb);

    if jsonb_typeof(v_style -> 'boxes') = 'array' then
      select coalesce(jsonb_agg(
        case when b ->> 'id' = p_box_id
          then b || jsonb_build_object('x', v_x, 'y', v_y)
          else b
        end
        order by ord), '[]'::jsonb)
      into v_boxes
      from jsonb_array_elements(v_style -> 'boxes') with ordinality as t(b, ord);
      v_style := v_style || jsonb_build_object('boxes', v_boxes);
      -- Box 0 mirrors into the legacy single-text columns.
      if (v_boxes -> 0 ->> 'id') = p_box_id then
        v_style := v_style || jsonb_build_object('x', v_x);
        v_segment.text_y := v_y;
      end if;
    elsif p_box_id = 'legacy-0' then
      v_style := v_style || jsonb_build_object('x', v_x);
      v_segment.text_y := v_y;
    end if;

    update public.brief_segments
      set overlay_style = v_style, text_y = v_segment.text_y
      where id = p_segment_id;
  end if;

  if p_screenshot_x is not null and p_screenshot_y is not null then
    update public.brief_segments
      set screenshot_x = least(0.98, greatest(0.02, p_screenshot_x)),
          screenshot_y = least(0.98, greatest(0.02, p_screenshot_y))
      where id = p_segment_id;
  end if;
end;
$$;

revoke all on function public.creator_place_segment(uuid, text, double precision, double precision, double precision, double precision) from public;
grant execute on function public.creator_place_segment(uuid, text, double precision, double precision, double precision, double precision) to authenticated;
