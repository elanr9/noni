-- Editing moves ahead of review: the video is stitched and overlaid right
-- after the creator submits, so the admin reviews the finished file and
-- Approve only posts it. render_status tracks that edit job per submission.
-- Default 'queued' keeps legacy in-flight submissions safe: post-approved
-- still assembles anything that is not 'ready' at approve time.

alter table public.submissions
  add column render_status text not null default 'queued'
    check (render_status in ('queued', 'rendering', 'ready', 'failed')),
  add column render_error text;
