-- Library ideas and references become fully AI-filled posts the moment they
-- are captured. Each library row can carry one ready video brief and one
-- ready slideshow brief. Those briefs live outside any week (no
-- campaign_briefs row) and are tagged with library_item_id so backlog and
-- setup queries can leave them out. copy_brief_into clones a ready brief,
-- segments included, into an empty week slot in one statement.

alter table public.briefs
  add column if not exists library_item_id uuid
    references public.library_items(id) on delete cascade;

create index if not exists briefs_library_item_idx
  on public.briefs (library_item_id)
  where library_item_id is not null;

alter table public.library_items
  add column if not exists video_brief_id uuid
    references public.briefs(id) on delete set null,
  add column if not exists carousel_brief_id uuid
    references public.briefs(id) on delete set null;

create or replace function public.copy_brief_into(
  p_source_brief_id uuid,
  p_target_brief_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.briefs%rowtype;
  v_target_company uuid;
begin
  select * into v_src from public.briefs where id = p_source_brief_id;
  if v_src.id is null then
    raise exception 'source brief not found';
  end if;
  select company_id into v_target_company from public.briefs where id = p_target_brief_id;
  if v_target_company is null then
    raise exception 'target brief not found';
  end if;
  if v_src.company_id <> v_target_company
     or v_target_company <> public.current_company_id()
     or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  update public.briefs set
    format             = v_src.format,
    title              = v_src.title,
    hook               = v_src.hook,
    hook_options       = v_src.hook_options,
    talking_points     = v_src.talking_points,
    hashtags           = v_src.hashtags,
    search_phrase      = v_src.search_phrase,
    point_count        = v_src.point_count,
    target_words       = v_src.target_words,
    script             = v_src.script,
    caption            = v_src.caption,
    why_it_works       = v_src.why_it_works,
    cta                = v_src.cta,
    post_type_id       = v_src.post_type_id,
    kill_reason        = null,
    generation_id      = v_src.generation_id,
    example_url        = v_src.example_url,
    example_transcript = v_src.example_transcript,
    text_overlay       = v_src.text_overlay,
    subtitles          = v_src.subtitles,
    subtitles_y        = v_src.subtitles_y,
    reviewed_at        = null,
    review_result      = null
  where id = p_target_brief_id;

  delete from public.brief_segments where brief_id = p_target_brief_id;

  insert into public.brief_segments (
    company_id, brief_id, slot_index, kind, talking_point_index, overlay_text,
    show_on_screen, screenshot_url, screenshot_x, screenshot_y, screenshot_width,
    layout, text_y, overlay_style
  )
  select
    v_target_company, p_target_brief_id, slot_index, kind, talking_point_index, overlay_text,
    show_on_screen, screenshot_url, screenshot_x, screenshot_y, screenshot_width,
    layout, text_y, overlay_style
  from public.brief_segments
  where brief_id = p_source_brief_id;
end;
$$;

grant execute on function public.copy_brief_into(uuid, uuid) to authenticated;
