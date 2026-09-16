-- Word level transcript of the submitted clips (Deepgram, ms relative to each
-- uploaded clip file) and the creator's cue timing (when on-screen text and
-- media enter on each clip). The edit pass writes transcript; the app writes
-- cues at submit for the slots the creator saw or adjusted in the editor.

alter table public.submissions
  add column if not exists transcript jsonb,
  add column if not exists cues jsonb;

comment on column public.submissions.transcript is
  '{ clips: [{ slot_index, words: [{ w, s, e }] }] }, ms relative to the uploaded clip';
comment on column public.submissions.cues is
  '[{ slot_index, text_start_ms, text_hold_ms, media_start_ms, media_end_ms, source }], ms relative to the uploaded clip';
