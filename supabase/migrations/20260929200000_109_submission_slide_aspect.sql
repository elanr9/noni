-- Photo carousels are cropped in the app to one aspect for the whole post,
-- the way Instagram crops a feed post. The bake renders every slide at that
-- aspect so Instagram and TikTok both receive the creator's crop as is.
alter table public.submissions
  add column if not exists slide_aspect text not null default '9:16'
  check (slide_aspect in ('9:16', '4:5', '1:1'));

comment on column public.submissions.slide_aspect is
  'Frame aspect the creator cropped every slide to; the bake renders at 1080x1920, 1080x1350 or 1080x1080.';
