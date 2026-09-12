-- A sixth video kind: one 7 second clip, one idea said out loud, on-screen
-- text carries the hook. Slideshow types shift down one sort slot.

create or replace function public.seed_company_post_types(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.post_types
    (company_id, key, label, family, min_points, max_points, clip_structure,
     requires_plug, requires_credential, default_week_count, sort_order,
     target_words_min, target_words_max)
  values
    (p_company_id, 'numbered_list',   'Numbered list',   'video',          3, 10, 'hook_points_outro', true,  true,  8, 1, 200, 400),
    (p_company_id, 'talking_head',    'Talking head',    'video',          3,  5, 'hook_points_outro', true,  true,  5, 2, 150, 300),
    (p_company_id, 'explainer',       'Explainer',       'video',          3,  5, 'hook_points_outro', true,  true,  3, 3, 150, 300),
    (p_company_id, 'contrast',        'Contrast',        'video',          4,  6, 'hook_points_outro', true,  true,  2, 4, 150, 300),
    (p_company_id, 'replay_bait',     'Replay bait',     'video',          1,  1, 'single_clip',       false, false, 2, 5, null, null),
    (p_company_id, 'seven_second',    '7 second video',  'video',          1,  1, 'single_clip',       false, false, 3, 6, 12, 25),
    (p_company_id, 'numbered_tips',   'Numbered tips',   'photo_carousel', 3, 10, 'slide_per_point',   true,  true,  5, 7, null, null),
    (p_company_id, 'how_to',          'How to',          'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  3, 8, null, null),
    (p_company_id, 'getting_started', 'Getting started', 'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  2, 9, null, null)
  on conflict (company_id, key) do nothing;
end;
$$;

update public.post_types set sort_order = case key
    when 'numbered_tips' then 7
    when 'how_to' then 8
    when 'getting_started' then 9
  end
  where key in ('numbered_tips', 'how_to', 'getting_started');

select public.seed_company_post_types(id) from public.companies;
