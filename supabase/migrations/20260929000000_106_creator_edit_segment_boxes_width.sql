-- Adds a wrap width per box (fraction of the frame). Creators may write the whole text box set of a clip or slide on their
-- own assignment: add boxes, edit words, resize, recolour, remove. The RPC
-- validates every box so the render never sees garbage; the manager's
-- screenshot and the rest of the segment stay untouched.

create or replace function public.creator_edit_segment_boxes(
  p_segment_id uuid,
  p_boxes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment public.brief_segments%rowtype;
  v_boxes jsonb := '[]'::jsonb;
  v_box jsonb;
  v_text text;
  v_first jsonb;
  v_style jsonb;
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
  if jsonb_typeof(p_boxes) <> 'array' or jsonb_array_length(p_boxes) > 8 then
    raise exception 'boxes must be an array of at most 8';
  end if;

  for v_box in select value from jsonb_array_elements(p_boxes) loop
    v_text := left(btrim(coalesce(v_box ->> 'text', '')), 160);
    if v_text = '' then
      continue;
    end if;
    if (v_box ->> 'color') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'box color must be #RRGGBB';
    end if;
    v_boxes := v_boxes || jsonb_build_object(
      'id', coalesce(nullif(v_box ->> 'id', ''), gen_random_uuid()::text),
      'text', v_text,
      'color', upper(v_box ->> 'color'),
      'bg', coalesce((v_box ->> 'bg')::boolean, false),
      'size', least(72.0 / 390, greatest(13.0 / 390, coalesce((v_box ->> 'size')::double precision, 0.05))),
      'x', least(0.98, greatest(0.02, coalesce((v_box ->> 'x')::double precision, 0.5))),
      'y', least(0.98, greatest(0.02, coalesce((v_box ->> 'y')::double precision, 0.3)))
    ) || case
      when (v_box ->> 'width') is not null
        then jsonb_build_object('width', least(0.95, greatest(0.2, (v_box ->> 'width')::double precision)))
      else '{}'::jsonb
    end;
  end loop;

  v_first := v_boxes -> 0;
  v_style := coalesce(v_segment.overlay_style, '{}'::jsonb) || jsonb_build_object(
    'boxes', v_boxes,
    'color', coalesce(v_first ->> 'color', '#FFFFFF'),
    'bg', coalesce((v_first ->> 'bg')::boolean, false),
    'size', round(coalesce((v_first ->> 'size')::double precision, 0.05) * 390),
    'x', coalesce((v_first ->> 'x')::double precision, 0.5)
  );

  update public.brief_segments
    set overlay_style = v_style,
        overlay_text = coalesce(v_first ->> 'text', ''),
        text_y = coalesce((v_first ->> 'y')::double precision, text_y),
        show_on_screen = jsonb_array_length(v_boxes) > 0
    where id = p_segment_id;
end;
$$;

revoke all on function public.creator_edit_segment_boxes(uuid, jsonb) from public;
grant execute on function public.creator_edit_segment_boxes(uuid, jsonb) to authenticated;
