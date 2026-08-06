-- 029: Noni-owned render timeline persisted on the submission at post time.
-- The timeline is render-service agnostic (clips with durations, text and
-- image elements with absolute ms timing). The Creatomate adapter reads this
-- object; the render service's own schema never enters the codebase.

alter table public.submissions
  add column if not exists render_timeline jsonb;

comment on column public.submissions.render_timeline is
  'Render manifest built at approve time from brief_segments + submission_segments. Shape: { width, height, clips: [{slot_index, duration_ms}], texts: [{text, start_ms, duration_ms}], images: [{screenshot_path, start_ms, duration_ms, x, y, width}] }.';
