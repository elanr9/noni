-- Creatomate render in flight for the overlay pass, so a long render can be
-- picked up by a later render-submission invocation instead of restarting.
alter table public.submissions add column if not exists overlay_render_id text;
