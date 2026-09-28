-- A render whose edge function isolate was killed mid-job stays 'rendering'
-- forever: creators cannot reclaim that status and nothing resets it. Track
-- when the job was last claimed (every hop re-claims) and sweep stale ones
-- back to 'failed' so the admin sees Retry edit instead of an endless spinner.

alter table public.submissions
  add column if not exists render_claimed_at timestamptz;

select cron.schedule(
  'noni-sweep-stale-renders',
  '*/5 * * * *',
  $$
  update public.submissions
  set render_status = 'failed',
      render_error = 'edit timed out, tap Retry edit',
      overlay_render_id = null
  where render_status = 'rendering'
    and coalesce(render_claimed_at, created_at) < now() - interval '20 minutes';
  $$
);
