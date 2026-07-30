-- Multi-segment recordings (Record v2). Ordered storage paths for each clip.
-- video_path stays the playable path: first segment on submit, replaced with the
-- stitched file by post-approved when there is more than one segment.

alter table public.submissions
  add column if not exists segment_paths text[];
