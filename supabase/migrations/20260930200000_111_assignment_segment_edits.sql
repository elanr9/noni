-- Text and picture placement per assignment. brief_segments stay the brief's
-- template (what the manager built before anyone recorded); when a creator or
-- a manager moves, restyles or retypes boxes or the inset on one creator's
-- post, that lands here and never touches the other creators on the same
-- brief. Readers (app and render) overlay a row onto its segment: the box set
-- (overlay_style, overlay_text, text_y, show_on_screen) is replaced as a whole
-- when overlay_style is set, each screenshot_* column when it is set.

create table if not exists public.assignment_segment_edits (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  segment_id uuid not null references public.brief_segments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  overlay_style jsonb,
  overlay_text text,
  text_y double precision,
  show_on_screen boolean,
  screenshot_x double precision,
  screenshot_y double precision,
  screenshot_width double precision,
  updated_at timestamptz not null default now(),
  primary key (assignment_id, segment_id)
);

alter table public.assignment_segment_edits enable row level security;

create policy "members read assignment segment edits" on public.assignment_segment_edits
  for select using (
    company_id = public.current_company_id()
    and (
      public.is_campaign_manager()
      or exists (
        select 1 from public.assignments a
        where a.id = assignment_id and a.creator_id = auth.uid()
      )
    )
  );

create policy "managers write assignment segment edits" on public.assignment_segment_edits
  for all
  using (company_id = public.current_company_id() and public.is_campaign_manager())
  with check (company_id = public.current_company_id() and public.is_campaign_manager());

-- ---------------------------------------------------------------------------
-- The creator's own assignment on a brief: the one they are working on now.
create or replace function public.creator_assignment_for_brief(p_brief_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id from public.assignments a
  where a.brief_id = p_brief_id
    and a.creator_id = auth.uid()
    and a.status in ('assigned', 'recorded', 'changes_requested')
  order by a.created_at desc
  limit 1
$$;

revoke all on function public.creator_assignment_for_brief(uuid) from public;
grant execute on function public.creator_assignment_for_brief(uuid) to authenticated;

-- A segment as this assignment sees it: the template with its edits applied.
create or replace function public.segment_for_assignment(p_segment_id uuid, p_assignment_id uuid)
returns public.brief_segments
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_segment public.brief_segments%rowtype;
  v_edit public.assignment_segment_edits%rowtype;
begin
  select * into v_segment from public.brief_segments where id = p_segment_id;
  if not found then
    raise exception 'segment not found';
  end if;
  select * into v_edit from public.assignment_segment_edits
    where assignment_id = p_assignment_id and segment_id = p_segment_id;
  if found then
    if v_edit.overlay_style is not null then
      v_segment.overlay_style := v_edit.overlay_style;
      v_segment.overlay_text := v_edit.overlay_text;
      v_segment.text_y := v_edit.text_y;
      v_segment.show_on_screen := coalesce(v_edit.show_on_screen, v_segment.show_on_screen);
    end if;
    v_segment.screenshot_x := coalesce(v_edit.screenshot_x, v_segment.screenshot_x);
    v_segment.screenshot_y := coalesce(v_edit.screenshot_y, v_segment.screenshot_y);
    v_segment.screenshot_width := coalesce(v_edit.screenshot_width, v_segment.screenshot_width);
  end if;
  return v_segment;
end;
$$;

revoke all on function public.segment_for_assignment(uuid, uuid) from public;
grant execute on function public.segment_for_assignment(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Creator writes the whole box set of one clip or slide on their own post.
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
  v_assignment uuid;
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
  v_assignment := public.creator_assignment_for_brief(v_segment.brief_id);
  if v_assignment is null then
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

  v_segment := public.segment_for_assignment(p_segment_id, v_assignment);
  v_first := v_boxes -> 0;
  v_style := coalesce(v_segment.overlay_style, '{}'::jsonb) || jsonb_build_object(
    'boxes', v_boxes,
    'color', coalesce(v_first ->> 'color', '#FFFFFF'),
    'bg', coalesce((v_first ->> 'bg')::boolean, false),
    'size', round(coalesce((v_first ->> 'size')::double precision, 0.05) * 390),
    'x', coalesce((v_first ->> 'x')::double precision, 0.5)
  );

  insert into public.assignment_segment_edits as e
    (assignment_id, segment_id, company_id, overlay_style, overlay_text, text_y, show_on_screen)
  values (
    v_assignment, p_segment_id, v_segment.company_id, v_style,
    coalesce(v_first ->> 'text', ''),
    coalesce((v_first ->> 'y')::double precision, v_segment.text_y),
    jsonb_array_length(v_boxes) > 0
  )
  on conflict (assignment_id, segment_id) do update
    set overlay_style = excluded.overlay_style,
        overlay_text = excluded.overlay_text,
        text_y = excluded.text_y,
        show_on_screen = excluded.show_on_screen,
        updated_at = now();
end;
$$;

-- Creator moves one box or the inset on their own post.
create or replace function public.creator_place_segment(
  p_segment_id uuid,
  p_box_id text default null,
  p_box_x double precision default null,
  p_box_y double precision default null,
  p_screenshot_x double precision default null,
  p_screenshot_y double precision default null,
  p_screenshot_width double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment public.brief_segments%rowtype;
  v_assignment uuid;
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
  v_assignment := public.creator_assignment_for_brief(v_segment.brief_id);
  if v_assignment is null then
    raise exception 'not assigned to this brief';
  end if;
  v_segment := public.segment_for_assignment(p_segment_id, v_assignment);

  insert into public.assignment_segment_edits (assignment_id, segment_id, company_id)
  values (v_assignment, p_segment_id, v_segment.company_id)
  on conflict do nothing;

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
      if (v_boxes -> 0 ->> 'id') = p_box_id then
        v_style := v_style || jsonb_build_object('x', v_x);
        v_segment.text_y := v_y;
      end if;
    elsif p_box_id = 'legacy-0' then
      v_style := v_style || jsonb_build_object('x', v_x);
      v_segment.text_y := v_y;
    end if;

    update public.assignment_segment_edits
      set overlay_style = v_style,
          overlay_text = v_segment.overlay_text,
          text_y = v_segment.text_y,
          show_on_screen = v_segment.show_on_screen,
          updated_at = now()
      where assignment_id = v_assignment and segment_id = p_segment_id;
  end if;

  if p_screenshot_x is not null and p_screenshot_y is not null then
    update public.assignment_segment_edits
      set screenshot_x = least(0.98, greatest(0.02, p_screenshot_x)),
          screenshot_y = least(0.98, greatest(0.02, p_screenshot_y)),
          updated_at = now()
      where assignment_id = v_assignment and segment_id = p_segment_id;
  end if;

  if p_screenshot_width is not null then
    update public.assignment_segment_edits
      set screenshot_width = least(0.95, greatest(0.15, p_screenshot_width)),
          updated_at = now()
      where assignment_id = v_assignment and segment_id = p_segment_id;
  end if;
end;
$$;

-- One text look per post, on the creator's own copy of every segment.
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
  v_assignment uuid;
  v_row record;
  v_segment public.brief_segments%rowtype;
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
  v_assignment := public.creator_assignment_for_brief(p_brief_id);
  if v_assignment is null then
    raise exception 'not assigned to this brief';
  end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid color';
  end if;
  if p_bg is null then
    raise exception 'invalid bg';
  end if;

  for v_row in select id from public.brief_segments where brief_id = p_brief_id loop
    v_segment := public.segment_for_assignment(v_row.id, v_assignment);
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
    insert into public.assignment_segment_edits
      (assignment_id, segment_id, company_id, overlay_style, overlay_text, text_y, show_on_screen)
    values (v_assignment, v_row.id, v_company, v_style, v_segment.overlay_text, v_segment.text_y, v_segment.show_on_screen)
    on conflict (assignment_id, segment_id) do update
      set overlay_style = excluded.overlay_style,
          overlay_text = excluded.overlay_text,
          text_y = excluded.text_y,
          show_on_screen = excluded.show_on_screen,
          updated_at = now();
  end loop;
end;
$$;
