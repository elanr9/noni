-- Creators set the playback gain applied after loudness normalization in the
-- stitch pass. 2.0 is the platform habit of running clips at 200 percent
-- volume; a limiter in the render keeps peaks below clipping.
alter table public.submissions
  add column if not exists audio_gain double precision not null default 2.0
  check (audio_gain >= 0.5 and audio_gain <= 3.0);

comment on column public.submissions.audio_gain is
  'Linear gain applied to the stitched audio after loudnorm (1.0 = unchanged, 2.0 = 200 percent).';
