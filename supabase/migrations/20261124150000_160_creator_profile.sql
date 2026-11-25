-- 160: the creator profile creators fill in on the website and in the app.
-- Adds languages and YouTube, lets the profile save country, moves niches
-- onto the one interest list the sign up chat uses, and gives companies the
-- new fields in the creator directory.

alter table public.creator_profiles
  add column if not exists languages text[] not null default '{}',
  add column if not exists youtube text,
  add column if not exists youtube_followers int check (youtube_followers >= 0);

-- One interest list everywhere (supabase/functions/apply-chat CREATOR niches,
-- lib/marketplace.ts NICHES, noni-web src/lib/creator-profile.ts).
create or replace function pg_temp.remap_niches(p text[]) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct m), '{}') from (
    select case n
      when 'beauty' then 'fashion_beauty'
      when 'fashion' then 'fashion_beauty'
      when 'money' then 'finance'
      when 'school' then 'education'
      when 'parenting' then 'home_family'
      else n end as m
    from unnest(p) n
  ) x;
$$;

update public.creator_profiles
  set niches = pg_temp.remap_niches(niches)
  where niches && array['beauty', 'fashion', 'money', 'school', 'parenting'];
update public.marketplace_listings
  set niches = pg_temp.remap_niches(niches)
  where niches && array['beauty', 'fashion', 'money', 'school', 'parenting'];

create or replace function public.save_creator_profile(p_patch jsonb)
returns public.creator_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.creator_profiles;
  v_year int;
  v_gender text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_year := nullif(p_patch ->> 'birth_year', '')::int;
  if v_year is not null and (v_year < 1920 or v_year > extract(year from now())::int) then
    raise exception 'That age does not look right';
  end if;
  v_gender := nullif(p_patch ->> 'gender', '');
  if v_gender is not null and v_gender not in ('female', 'male', 'nonbinary', 'undisclosed') then
    raise exception 'unknown gender value';
  end if;

  insert into public.creator_profiles (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  update public.creator_profiles c set
    instagram = case when p_patch ? 'instagram' then nullif(trim(leading '@' from trim(p_patch ->> 'instagram')), '') else c.instagram end,
    tiktok = case when p_patch ? 'tiktok' then nullif(trim(leading '@' from trim(p_patch ->> 'tiktok')), '') else c.tiktok end,
    youtube = case when p_patch ? 'youtube' then nullif(trim(leading '@' from trim(p_patch ->> 'youtube')), '') else c.youtube end,
    experience = case when p_patch ->> 'experience' in ('pro', 'some', 'new') then p_patch ->> 'experience' else c.experience end,
    best_campaign = case when p_patch ? 'best_campaign' then nullif(trim(p_patch ->> 'best_campaign'), '') else c.best_campaign end,
    niches = case when jsonb_typeof(p_patch -> 'niches') = 'array'
      then coalesce((select (array_agg(distinct lower(trim(v))))[1:5] from jsonb_array_elements_text(p_patch -> 'niches') v where trim(v) <> ''), '{}')
      else c.niches end,
    languages = case when jsonb_typeof(p_patch -> 'languages') = 'array'
      then coalesce((select (array_agg(distinct lower(trim(v))))[1:5] from jsonb_array_elements_text(p_patch -> 'languages') v where trim(v) <> ''), '{}')
      else c.languages end,
    portfolio = case when jsonb_typeof(p_patch -> 'portfolio') = 'array'
      then coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(p_patch -> 'portfolio') e limit 3) x), '[]'::jsonb)
      else c.portfolio end,
    bio = case when p_patch ? 'bio' then nullif(left(trim(p_patch ->> 'bio'), 600), '') else c.bio end,
    gender = case when p_patch ? 'gender' then v_gender else c.gender end,
    birth_year = case when p_patch ? 'birth_year' then v_year else c.birth_year end,
    country = case when p_patch ? 'country' then nullif(left(trim(p_patch ->> 'country'), 60), '') else c.country end,
    location = case when p_patch ? 'location' then nullif(left(trim(p_patch ->> 'location'), 80), '') else c.location end,
    tiktok_followers = case when p_patch ? 'tiktok_followers' then greatest(0, nullif(p_patch ->> 'tiktok_followers', '')::int) else c.tiktok_followers end,
    instagram_followers = case when p_patch ? 'instagram_followers' then greatest(0, nullif(p_patch ->> 'instagram_followers', '')::int) else c.instagram_followers end,
    youtube_followers = case when p_patch ? 'youtube_followers' then greatest(0, nullif(p_patch ->> 'youtube_followers', '')::int) else c.youtube_followers end,
    listed = case when jsonb_typeof(p_patch -> 'listed') = 'boolean' then (p_patch ->> 'listed')::boolean else c.listed end,
    updated_at = now()
  where c.user_id = v_uid
  returning * into v_row;
  return v_row;
end;
$$;

-- The directory row gains YouTube, per platform followers, country and
-- languages. The return shape changes, so it is dropped first;
-- marketplace_creators (plpgsql) picks the new columns up as they are.
drop function if exists public.marketplace_creator_rows(uuid, uuid);

create or replace function public.marketplace_creator_rows(p_company_id uuid, p_listing_id uuid)
returns table (
  creator_id uuid, full_name text, avatar_path text,
  age int, gender text, location text, bio text,
  instagram text, tiktok text, followers int,
  youtube text, tiktok_followers int, instagram_followers int, youtube_followers int,
  country text, languages text[],
  experience text, campaigns_done text, best_campaign text,
  niches text[], styles text[], on_camera text, weekly_capacity text, portfolio jsonb,
  total_views bigint, posts_live int, total_earned_cents bigint, companies_count int,
  joined_at timestamptz, is_member boolean,
  match_score int, match_reason text, match_ai boolean,
  application_id uuid, application_status text, application_origin text,
  application_note text, signed_name text, signed_at timestamptz, start_date date, applied_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with listing as (
    select l.* from public.marketplace_listings l
    where l.id = p_listing_id and l.company_id = p_company_id
  ),
  views as (
    select a.creator_id, count(distinct p.id)::int as posts_live, coalesce(sum(pm.views), 0)::bigint as total_views
    from public.posts p
    join public.assignments a on a.id = p.assignment_id
    left join lateral (
      select max(m.views) as views from public.post_metrics m where m.post_id = p.id
    ) pm on true
    group by a.creator_id
  ),
  earned as (
    select w.creator_id, coalesce(sum(w.amount_cents), 0)::bigint as cents
    from public.wallet_ledger w
    where w.kind in ('bounty_credit', 'streak_bonus')
    group by w.creator_id
  ),
  base as (
    select
      cp.user_id as creator_id, p.full_name, p.avatar_path,
      case when cp.birth_year is null then null else extract(year from now())::int - cp.birth_year end as age,
      cp.gender, cp.location, cp.bio, cp.instagram, cp.tiktok,
      cp.youtube, cp.tiktok_followers, cp.instagram_followers, cp.youtube_followers,
      cp.country, cp.languages,
      case when cp.tiktok_followers is null and cp.instagram_followers is null and cp.youtube_followers is null then null
        else coalesce(cp.tiktok_followers, 0) + coalesce(cp.instagram_followers, 0) + coalesce(cp.youtube_followers, 0) end as followers,
      cp.experience, cp.campaigns_done, cp.best_campaign,
      cp.niches, cp.styles, cp.on_camera, cp.weekly_capacity, cp.portfolio,
      coalesce(v.total_views, 0) as total_views, coalesce(v.posts_live, 0) as posts_live,
      coalesce(e.cents, 0) as total_earned_cents,
      (select count(*)::int from public.company_members m
        where m.profile_id = cp.user_id and m.removed_at is null and (m.role = 'creator' or m.can_create)) as companies_count,
      p.created_at as joined_at,
      exists (select 1 from public.company_members m
        where m.profile_id = cp.user_id and m.company_id = p_company_id and m.removed_at is null
          and (m.role = 'creator' or m.can_create)) as is_member,
      (select count(*)::int from listing l, unnest(l.niches) n where n = any (cp.niches)) as overlap,
      (select coalesce(cardinality(l.niches), 0) from listing l) as wanted
    from public.creator_profiles cp
    join public.profiles p on p.id = cp.user_id
    left join views v on v.creator_id = cp.user_id
    left join earned e on e.creator_id = cp.user_id
    where cp.listed
  )
  select
    b.creator_id, b.full_name, b.avatar_path, b.age, b.gender, b.location, b.bio,
    b.instagram, b.tiktok, b.followers,
    b.youtube, b.tiktok_followers, b.instagram_followers, b.youtube_followers,
    b.country, b.languages,
    b.experience, b.campaigns_done, b.best_campaign,
    b.niches, b.styles, b.on_camera, b.weekly_capacity, b.portfolio,
    b.total_views, b.posts_live, b.total_earned_cents, b.companies_count, b.joined_at, b.is_member,
    -- The AI's score when it has one; otherwise a plain score from niche
    -- overlap, experience and proven views so the list is never unsorted.
    coalesce(mm.score, least(100, (
      case when coalesce(b.wanted, 0) > 0 then round(45.0 * b.overlap / b.wanted)::int else 20 end
      + case b.experience when 'pro' then 20 when 'some' then 12 else 5 end
      + least(20, (ln(1 + b.total_views) * 1.6)::int)
      + case when jsonb_array_length(coalesce(b.portfolio, '[]'::jsonb)) > 0 then 8 else 0 end
      + case when b.posts_live > 0 then 7 else 0 end
    ))) as match_score,
    mm.reason as match_reason,
    mm.score is not null as match_ai,
    a.id, a.status, a.origin, a.note, a.signed_name, a.signed_at, a.start_date, a.created_at
  from base b
  left join public.marketplace_matches mm on mm.listing_id = p_listing_id and mm.creator_id = b.creator_id
  left join lateral (
    select x.* from public.marketplace_applications x
    where x.creator_id = b.creator_id and x.company_id = p_company_id
    order by (x.listing_id = p_listing_id) desc nulls last, x.updated_at desc
    limit 1
  ) a on true;
$$;

revoke execute on function public.marketplace_creator_rows(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marketplace_creator_rows(uuid, uuid) to service_role;
