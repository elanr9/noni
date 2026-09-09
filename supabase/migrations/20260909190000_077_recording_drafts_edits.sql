-- Non destructive creator edits (trim, speed, mute, crop) made in the video
-- editor persist alongside the kept clips so a draft survives app restarts.

alter table public.recording_drafts
  add column edits jsonb not null default '{}'::jsonb;

comment on column public.recording_drafts.edits is
  'Per slot non destructive edit list from the creator video editor, keyed by slot_index as a string.';
