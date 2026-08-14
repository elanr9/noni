-- Post types are company-scoped. New companies (ops-create-company) never
-- received the eight authoring types, so week setup fails with an empty list.
-- Seed on insert, and backfill anyone still missing them.

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
    (p_company_id, 'numbered_tips',   'Numbered tips',   'photo_carousel', 3, 10, 'slide_per_point',   true,  true,  5, 6, null, null),
    (p_company_id, 'how_to',          'How to',          'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  3, 7, null, null),
    (p_company_id, 'getting_started', 'Getting started', 'photo_carousel', 3,  7, 'slide_per_point',   true,  true,  2, 8, null, null)
  on conflict (company_id, key) do nothing;
end;
$$;

create or replace function public.companies_seed_post_types()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_company_post_types(new.id);
  return new;
end;
$$;

drop trigger if exists companies_seed_post_types on public.companies;
create trigger companies_seed_post_types
  after insert on public.companies
  for each row execute function public.companies_seed_post_types();

select public.seed_company_post_types(id) from public.companies;
