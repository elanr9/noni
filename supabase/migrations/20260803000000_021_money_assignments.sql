-- MVP v2 milestone 6: money rekeyed to assignments.
-- posts and attribution_links gain assignment_id so posting, metrics polling
-- and revenue attribution work for campaign-published assignments that have
-- no legacy content_task. Same additive pattern as migration 020 used for
-- submissions; task_id keys keep working for backfilled rows.

alter table public.posts
  alter column task_id drop not null;

alter table public.posts
  add column assignment_id uuid references public.assignments;

alter table public.posts
  add constraint posts_target_check
  check (task_id is not null or assignment_id is not null);

create index posts_assignment on public.posts (assignment_id);

alter table public.attribution_links
  add column assignment_id uuid references public.assignments;

create index attribution_links_assignment
  on public.attribution_links (assignment_id);
