-- Per-post subtitles toggle set by the campaign manager in the post editor.
-- When on, the render pass burns auto-transcribed captions onto the reel:
-- always two lines, bottom of the frame, talking-head style. Off by default.

alter table public.briefs
  add column subtitles boolean not null default false;

comment on column public.briefs.subtitles is
  'Burn auto-transcribed two-line captions onto the rendered reel.';
