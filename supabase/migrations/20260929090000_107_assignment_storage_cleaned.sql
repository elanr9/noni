-- Once every platform has the post live, the raw takes and intermediate cuts
-- are deleted from storage; only the finished file stays for playback.
alter table public.assignments
  add column if not exists storage_cleaned_at timestamptz;
