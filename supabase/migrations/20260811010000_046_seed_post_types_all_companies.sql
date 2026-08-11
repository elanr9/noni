-- Seed the eight authoring post types for any company missing them.
-- Week setup uses default_week_count (sums to 20 video / 10 slideshow).

insert into public.post_types
  (company_id, key, label, family, min_points, max_points, clip_structure,
   requires_plug, requires_credential, default_week_count, sort_order,
   target_words_min, target_words_max)
select c.id, t.key, t.label, t.family, t.min_points, t.max_points,
       t.clip_structure, t.requires_plug, t.requires_credential,
       t.default_week_count, t.sort_order, t.target_words_min, t.target_words_max
from public.companies c
cross join (
  values
    ('numbered_list',   'Numbered list',   'video',          3, 10, 'hook_points_outro', true,  true,  8, 1, 200, 400),
    ('talking_head',    'Talking head',    'video',          3,  5, 'hook_points_outro', true,  true,  5, 2, 150, 300),
    ('explainer',       'Explainer',       'video',          3,  5, 'hook_points_outro', true,  true,  3, 3, 150, 300),
    ('contrast',        'Contrast',        'video',          4,  6, 'hook_points_outro', true,  true,  2, 4, 150, 300),
    ('replay_bait',     'Replay bait',     'video',          1,  1, 'single_clip',       false, false, 2, 5, null::int, null::int),
    ('numbered_tips',   'Numbered tips',   'photo_carousel', 3, 10, 'slide_per_point',   true,  true,  5, 6, null::int, null::int),
    ('how_to',          'How to',          'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  3, 7, null::int, null::int),
    ('getting_started', 'Getting started', 'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  2, 8, null::int, null::int)
) as t(key, label, family, min_points, max_points, clip_structure,
       requires_plug, requires_credential, default_week_count, sort_order,
       target_words_min, target_words_max)
where not exists (
  select 1 from public.post_types pt where pt.company_id = c.id
);
