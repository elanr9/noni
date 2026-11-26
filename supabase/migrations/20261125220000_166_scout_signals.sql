-- 166: Scout signals. What a company sorts and filters creators by.
--
-- Scout now reads hundreds of accounts a search and keeps, for each one,
-- how often and how recently they post, how their audience responds, and
-- what Claude saw: who they are (already makes UGC, a creator, or simply a
-- person in the niche), whether they show up on camera, and the gender and
-- age range their profile states or shows. None of these change the score.
--
-- status 'found' now means: saved from a search, pictures not copied yet.

alter table public.scout_creators
  add column if not exists posts_per_week   numeric(4,1),
  add column if not exists last_post_at     timestamptz,
  -- Percent. TikTok: likes and comments over views. Instagram: over followers.
  add column if not exists engagement_rate  numeric(4,1),
  add column if not exists kind             text check (kind in ('ugc', 'creator', 'niche')),
  add column if not exists on_camera        boolean,
  add column if not exists gender           text check (gender in ('female', 'male')),
  add column if not exists age              text check (age in ('18-24', '25-34', '35+'));

-- Accounts found before this migration: activity from the videos already kept.
with v as (
  select c.id,
         max((e->>'posted_at')::timestamptz) as last_at,
         count(*) filter (where (e->>'posted_at')::timestamptz > c.created_at - interval '90 days') as n,
         min((e->>'posted_at')::timestamptz) filter (where (e->>'posted_at')::timestamptz > c.created_at - interval '90 days') as first_at,
         c.created_at
  from public.scout_creators c
  cross join lateral jsonb_array_elements(c.videos) e
  where c.last_post_at is null and e->>'posted_at' is not null
  group by c.id, c.created_at
)
update public.scout_creators c
set last_post_at = v.last_at,
    posts_per_week = case
      when v.n = 0 then 0
      else least(21, round((v.n * 7.0 / greatest(2, extract(epoch from (v.created_at - v.first_at)) / 86400.0))::numeric, 1))
    end
from v
where v.id = c.id;
