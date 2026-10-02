-- Photo posts carry two crops per slide: the 9:16 TikTok cut in
-- segment_paths and a 4:5 Instagram cut here, both framed by the creator.
-- The bake burns the same text onto each so neither feed gets a letterbox.

alter table public.submissions
  add column if not exists instagram_segment_paths text[];
