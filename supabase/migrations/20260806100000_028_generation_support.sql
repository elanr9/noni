-- Agent 2 (generation) support.
-- 1. Per-type spoken length bounds. Null on both = no length check. The old
--    global 300-450 target measured what two sub-2k-view creators post and
--    was deleted as a target; these starting values are an explicit guess to
--    be replaced once thirty posts have performance attached.
-- 2. sync_brief_segments: transactional derive / re-derive of the render
--    manifest. PostgREST upserts cannot arbitrate on the DEFERRABLE unique
--    (brief_id, slot_index) constraint, so index shifts must happen inside
--    one function call. Survivors are matched by talking_point_index (points
--    and slides) or by kind (hook, outro) and keep their overlay_text,
--    show_on_screen, and screenshot_url; the admin may have edited them.

alter table public.post_types
  add column target_words_min int,
  add column target_words_max int;

update public.post_types set target_words_min = 200, target_words_max = 400
  where key = 'numbered_list';
update public.post_types set target_words_min = 150, target_words_max = 300
  where key in ('talking_head', 'explainer', 'contrast');
-- replay_bait and the carousels stay null on both: replay_bait is on-screen
-- text only, carousels are governed per slide, not by word count.

create or replace function public.sync_brief_segments(
  p_brief_id uuid,
  p_company_id uuid,
  p_segments jsonb
) returns setof public.brief_segments
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.briefs b
    where b.id = p_brief_id and b.company_id = p_company_id
  ) then
    raise exception 'brief % not found for company %', p_brief_id, p_company_id;
  end if;

  -- Remove segments whose identity is gone from the desired set.
  delete from public.brief_segments s
  where s.brief_id = p_brief_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_segments) as d(
        slot_index int, kind text, talking_point_index int,
        overlay_text text, show_on_screen boolean
      )
      where case
        when d.talking_point_index is not null
          then s.talking_point_index = d.talking_point_index
        else s.talking_point_index is null and s.kind = d.kind
      end
    );

  -- Survivors: move slot_index and kind, preserve admin-owned fields.
  update public.brief_segments s
  set slot_index = d.slot_index,
      kind = d.kind
  from jsonb_to_recordset(p_segments) as d(
    slot_index int, kind text, talking_point_index int,
    overlay_text text, show_on_screen boolean
  )
  where s.brief_id = p_brief_id
    and case
      when d.talking_point_index is not null
        then s.talking_point_index = d.talking_point_index
      else s.talking_point_index is null and s.kind = d.kind
    end;

  -- New segments.
  insert into public.brief_segments
    (company_id, brief_id, slot_index, kind, talking_point_index,
     overlay_text, show_on_screen)
  select p_company_id, p_brief_id, d.slot_index, d.kind,
         d.talking_point_index, d.overlay_text,
         coalesce(d.show_on_screen, true)
  from jsonb_to_recordset(p_segments) as d(
    slot_index int, kind text, talking_point_index int,
    overlay_text text, show_on_screen boolean
  )
  where not exists (
    select 1 from public.brief_segments s
    where s.brief_id = p_brief_id
      and case
        when d.talking_point_index is not null
          then s.talking_point_index = d.talking_point_index
        else s.talking_point_index is null and s.kind = d.kind
      end
  );

  return query
    select * from public.brief_segments
    where brief_id = p_brief_id
    order by slot_index;
end;
$$;
