-- Library make: ideas and references become posts in the new slides format
-- through write-deck make mode.
--
-- 1. reference_studies.phase: where a running study is (reading,
--    transcribing, reading_slides, studying), so the Library shows live steps
--    while study-reference works in the background. Null once it settles.
-- 2. Backfill the post links on library rows. A make that was interrupted
--    before its patch left briefs tagged with library_item_id but the row's
--    video_brief_id / carousel_brief_id null, so the row showed in no tab.

alter table public.reference_studies
  add column if not exists phase text
    check (phase is null or phase in ('reading', 'transcribing', 'reading_slides', 'studying'));

update public.library_items li
set video_brief_id = (
  select b.id from public.briefs b
  where b.library_item_id = li.id
    and b.format = 'video'
    and b.archived_at is null
  order by b.created_at desc
  limit 1
)
where li.video_brief_id is null
  and exists (
    select 1 from public.briefs b
    where b.library_item_id = li.id and b.format = 'video' and b.archived_at is null
  );

update public.library_items li
set carousel_brief_id = (
  select b.id from public.briefs b
  where b.library_item_id = li.id
    and b.format = 'photo_carousel'
    and b.archived_at is null
  order by b.created_at desc
  limit 1
)
where li.carousel_brief_id is null
  and exists (
    select 1 from public.briefs b
    where b.library_item_id = li.id and b.format = 'photo_carousel' and b.archived_at is null
  );
