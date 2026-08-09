-- Admin-placed vertical position for a segment's on-screen text, normalized
-- 0-1 center like screenshot_y. Null falls back to the render default (0.45).
-- Set from the same drag-to-place sheet as the screenshot.

alter table public.brief_segments
  add column text_y real;
