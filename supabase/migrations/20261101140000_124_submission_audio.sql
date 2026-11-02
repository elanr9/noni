-- Sound on posts (AUDIO.md): the track the creator put under a take, where it
-- starts and the mix, kept on the submission so review shows it and publish
-- can attach the Instagram audio id. The TikTok confirmation ("Done" on the
-- copy and search card) reuses assignments.music_marked_by_creator_at.
alter table public.submissions
  add column if not exists audio jsonb;

comment on column public.submissions.audio is
  'PostAudio: { track: { id, title, artist, dur, igAudioId?, url? }, start, vol, voice }';
