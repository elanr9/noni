-- 176: Scout keeps everyone it has ever read in one pool.
-- Until now each search read TikTok and Instagram from scratch and its work
-- stayed in one company's list. Now every profile read and classified is kept
-- once in scout_pool. A search asks the pool first (free, in seconds) and
-- only reads the platforms for people the pool does not have or whose read
-- has gone stale. A profile is classified once (person, gender, age, kind,
-- on camera); only how well they fit a company is judged per company.
--
-- Also: a search can be automatic (the small daily one that keeps a company's
-- board growing), and scout_creators.source gains 'pool'.

create table if not exists public.scout_pool (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('tiktok', 'instagram')),
  handle text not null,
  name text,
  avatar_url text,
  bio text,
  followers integer,
  median_views integer,
  posts_per_week numeric,
  last_post_at timestamptz,
  engagement_rate numeric,
  email text,
  videos jsonb not null default '[]'::jsonb,
  is_person boolean,
  likely_minor boolean not null default false,
  kind text check (kind in ('ugc', 'creator', 'niche')),
  on_camera boolean,
  gender text check (gender in ('female', 'male')),
  age text check (age in ('18-24', '25-34', '35+')),
  topics text[] not null default '{}',
  -- Name, bio, topics and captions in one string, for the text search.
  search_text text not null default '',
  search tsvector generated always as (to_tsvector('english', search_text)) stored,
  -- When the platform was last read, and when Claude last classified them.
  read_at timestamptz not null default now(),
  classified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, handle)
);

create index if not exists scout_pool_search_idx on public.scout_pool using gin (search);
create index if not exists scout_pool_read_idx on public.scout_pool (read_at);

-- Only the server reads and writes the pool.
alter table public.scout_pool enable row level security;
revoke all on public.scout_pool from public, anon, authenticated;
grant all on public.scout_pool to service_role;

alter table public.scout_creators drop constraint if exists scout_creators_source_check;
alter table public.scout_creators
  add constraint scout_creators_source_check check (source in ('search', 'link', 'pool'));

alter table public.scout_runs add column if not exists auto boolean not null default false;

-- People in the pool for a search: any of the topics in what they post, in
-- the follower range, read recently, a real adult, and not someone this
-- company has already seen. Best text match first.
create or replace function public.scout_pool_search(
  p_company_id uuid,
  p_topics text[],
  p_platforms text[],
  p_min integer,
  p_max integer,
  p_genders text[],
  p_ages text[],
  p_kinds text[],
  p_on_camera boolean,
  p_limit integer
)
returns setof public.scout_pool
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select coalesce(
      (select string_agg('(' || plainto_tsquery('english', t)::text || ')', ' | ')
         from unnest(p_topics) t
        where plainto_tsquery('english', t)::text <> ''),
      ''
    ) as text
  )
  select p.*
  from public.scout_pool p, q
  where q.text <> ''
    and p.search @@ to_tsquery('english', q.text)
    and p.platform = any (p_platforms)
    and p.read_at > now() - interval '45 days'
    and p.classified_at is not null
    and p.is_person is true
    and p.likely_minor is false
    and (p_min is null or p.followers is null or p.followers >= p_min)
    and (p_max is null or p.followers is null or p.followers <= p_max)
    and (coalesce(array_length(p_genders, 1), 0) = 0 or p.gender = any (p_genders))
    and (coalesce(array_length(p_ages, 1), 0) = 0 or p.age = any (p_ages))
    and (coalesce(array_length(p_kinds, 1), 0) = 0 or p.kind = any (p_kinds))
    and (p_on_camera is not true or p.on_camera is true)
    and not exists (
      select 1 from public.scout_creators c
      where c.company_id = p_company_id and c.platform = p.platform and c.handle = p.handle
    )
  order by ts_rank(p.search, to_tsquery('english', q.text)) desc, p.last_post_at desc nulls last
  limit greatest(0, least(coalesce(p_limit, 300), 1000));
$$;

revoke execute on function public.scout_pool_search(uuid, text[], text[], integer, integer, text[], text[], text[], boolean, integer) from public, anon, authenticated;
grant execute on function public.scout_pool_search(uuid, text[], text[], integer, integer, text[], text[], text[], boolean, integer) to service_role;

-- Everyone already vetted goes into the pool, so the first searches after
-- this have something to draw on. Rows vetted before gender, age and kind
-- were kept are left unclassified and are classified when next used.
insert into public.scout_pool (
  platform, handle, name, avatar_url, bio, followers, median_views, posts_per_week, last_post_at,
  engagement_rate, email, videos, is_person, likely_minor, kind, on_camera, gender, age, topics,
  search_text, read_at, classified_at
)
select distinct on (c.platform, c.handle)
  c.platform, c.handle, c.name, c.avatar_url, c.bio, c.followers, c.median_views, c.posts_per_week, c.last_post_at,
  c.engagement_rate, c.email, coalesce(c.videos, '[]'::jsonb),
  case when c.kind is null then null else true end,
  coalesce(c.likely_minor, false), c.kind, c.on_camera, c.gender, c.age, coalesce(c.tags, '{}'),
  left(concat_ws(' ', c.name, c.bio, array_to_string(coalesce(c.tags, '{}'), ' '),
    (select string_agg(v ->> 'caption', ' ') from jsonb_array_elements(coalesce(c.videos, '[]'::jsonb)) v)), 4000),
  c.created_at,
  case when c.kind is null then null else c.updated_at end
from public.scout_creators c
where c.source = 'search' and c.status not in ('found', 'vetting')
order by c.platform, c.handle, c.created_at desc
on conflict (platform, handle) do nothing;
