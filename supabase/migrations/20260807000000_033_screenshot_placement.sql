-- Admin-placed screenshot position. Normalized 0-1 center coordinates and
-- width fraction of the frame, matching TimelineImage in renderTimeline.ts.
-- Null means the render falls back to the default placement (0.5, 0.62, 0.72).

alter table public.brief_segments
  add column screenshot_x numeric check (screenshot_x >= 0 and screenshot_x <= 1),
  add column screenshot_y numeric check (screenshot_y >= 0 and screenshot_y <= 1),
  add column screenshot_width numeric check (screenshot_width > 0 and screenshot_width <= 1);

comment on column public.brief_segments.screenshot_x is
  'Normalized 0-1 horizontal center of the screenshot overlay. Null = default.';
comment on column public.brief_segments.screenshot_y is
  'Normalized 0-1 vertical center of the screenshot overlay. Null = default.';
comment on column public.brief_segments.screenshot_width is
  'Screenshot overlay width as a fraction of frame width. Null = default.';
