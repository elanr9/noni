-- 161: Scout. Noni finds creators for a company outside Noni.
--
-- A scout run turns the company brain into TikTok and Instagram searches,
-- pulls posts and profiles through Apify, and has Claude watch each account
-- and score it. Every account found lands in scout_creators, one row per
-- company and handle, and moves Found -> Contacted -> Joined. The company
-- sends the first message from its own account (Noni drafts it); the link
-- in that message (/join/<slug>?c=<code>) brings the creator onto Noni and
-- straight into the company.
--
-- The scout edge function does all writes with the service role. Managers of
-- the company and the platform admin can read.

create table if not exists public.scout_runs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies on delete cascade,
  -- Who to find, in the words of whoever started it.
  brief        text not null default '',
  -- { ideal, tiktok_queries[], tiktok_hashtags[], instagram_hashtags[],
  --   min_followers, max_followers, platforms[], seeds[] }
  plan         jsonb not null default '{}'::jsonb,
  status       text not null default 'planning'
    check (status in ('planning', 'searching', 'enriching', 'vetting', 'done', 'failed')),
  -- Apify runs in flight: { search: [...], enrich: [...] }
  jobs         jsonb not null default '{}'::jsonb,
  -- { posts, accounts, shortlisted, vetted, matches }
  counts       jsonb not null default '{}'::jsonb,
  error        text,
  -- One worker at a time advances a run.
  lease_until  timestamptz,
  created_by   uuid references public.profiles on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists scout_runs_company_idx on public.scout_runs (company_id, created_at desc);
create index if not exists scout_runs_active_idx on public.scout_runs (status)
  where status in ('planning', 'searching', 'enriching', 'vetting');

create table if not exists public.scout_creators (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies on delete cascade,
  run_id         uuid references public.scout_runs on delete set null,
  -- search: found by a run. link: applied through the company's join link.
  source         text not null default 'search' check (source in ('search', 'link')),
  platform       text not null check (platform in ('tiktok', 'instagram')),
  handle         text not null,
  name           text,
  avatar_url     text,
  bio            text,
  followers      int,
  median_views   int,
  posts_found    int not null default 0,
  email          text,
  -- [{ url, cover, views, caption }] newest first, at most 6
  videos         jsonb not null default '[]'::jsonb,
  score          int check (score between 0 and 100),
  why            text,
  tags           text[] not null default '{}',
  dm             text,
  email_subject  text,
  email_body     text,
  likely_minor   boolean not null default false,
  status         text not null default 'found'
    check (status in ('found', 'vetting', 'match', 'skipped', 'contacted', 'replied', 'applied', 'joined', 'passed')),
  -- Short code in the join link, so a sign up is tied back to this row.
  code           text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  profile_id     uuid references public.profiles on delete set null,
  contacted_at   timestamptz,
  replied_at     timestamptz,
  joined_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, platform, handle)
);

create index if not exists scout_creators_board_idx
  on public.scout_creators (company_id, status, score desc nulls last);

alter table public.scout_runs enable row level security;
alter table public.scout_creators enable row level security;

drop policy if exists scout_runs_read on public.scout_runs;
create policy scout_runs_read on public.scout_runs
  for select to authenticated
  using (
    public.is_platform_admin()
    or (company_id = public.current_company_id() and public.is_campaign_manager())
  );

drop policy if exists scout_creators_read on public.scout_creators;
create policy scout_creators_read on public.scout_creators
  for select to authenticated
  using (
    public.is_platform_admin()
    or (company_id = public.current_company_id() and public.is_campaign_manager())
  );

revoke insert, update, delete on public.scout_runs, public.scout_creators from anon, authenticated;
revoke all on public.scout_runs, public.scout_creators from anon;

-- The join link's slug, made from the company name the first time Scout
-- needs it (companies.slug is internal and often "new-company").
alter table public.companies add column if not exists join_slug text unique;

create or replace function public.scout_join_slug(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_name text;
  v_root text;
  v_try text;
begin
  select join_slug, name into v_slug, v_name from public.companies where id = p_company_id;
  if v_slug is not null then
    return v_slug;
  end if;
  v_root := coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(v_name, '')), '[^a-z0-9]+', '-', 'g')), ''), 'join');
  for i in 1..200 loop
    v_try := case when i = 1 then v_root else v_root || '-' || i end;
    exit when not exists (select 1 from public.companies where join_slug = v_try);
  end loop;
  update public.companies set join_slug = v_try where id = p_company_id;
  return v_try;
end;
$$;

revoke execute on function public.scout_join_slug(uuid) from public, anon, authenticated;

-- The public join page: the company's name, logo and color by join slug.
-- Nothing else about the company leaves the database.
create or replace function public.scout_join_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'slug', c.join_slug,
    'logo_path', c.logo_path,
    'color', c.settings #>> '{overlay_theme,color}'
  )
  from public.companies c
  where c.join_slug = lower(p_slug)
  limit 1;
$$;

grant execute on function public.scout_join_page(text) to anon, authenticated;

-- A signed in creator opened a join link. With a code from a message the
-- company sent, they join the company at once (the company reached out).
-- Without one, they apply and the company accepts on the Scout tab.
-- Returns { status: 'joined' | 'applied', company_id }.
create or replace function public.scout_claim(p_slug text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_row public.scout_creators;
  v_ig text;
  v_tt text;
  v_name text;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  select id into v_company from public.companies where join_slug = lower(p_slug);
  if v_company is null then
    raise exception 'company not found';
  end if;

  if exists (
    select 1 from public.company_members m
    where m.company_id = v_company and m.profile_id = v_user and m.removed_at is null
  ) then
    return jsonb_build_object('status', 'joined', 'company_id', v_company);
  end if;

  if p_code is not null and p_code <> '' then
    select * into v_row from public.scout_creators
      where company_id = v_company and code = p_code and status <> 'passed'
      limit 1;
  end if;

  if v_row.id is not null then
    perform public.marketplace_join(v_company, v_user);
    update public.scout_creators
      set status = 'joined', profile_id = v_user, joined_at = now(), updated_at = now()
      where id = v_row.id;
    return jsonb_build_object('status', 'joined', 'company_id', v_company);
  end if;

  select lower(nullif(trim(both '@' from cp.instagram), '')), lower(nullif(trim(both '@' from cp.tiktok), ''))
    into v_ig, v_tt
    from public.creator_profiles cp where cp.user_id = v_user;
  select coalesce(full_name, '') into v_name from public.profiles where id = v_user;

  insert into public.scout_creators (company_id, source, platform, handle, name, status, profile_id)
  values (
    v_company, 'link',
    case when v_tt is not null or v_ig is null then 'tiktok' else 'instagram' end,
    coalesce(v_tt, v_ig, 'noni:' || v_user::text),
    nullif(v_name, ''),
    'applied', v_user
  )
  on conflict (company_id, platform, handle) do update
    set status = case
          when scout_creators.status in ('joined', 'passed') then scout_creators.status
          else 'applied'
        end,
        profile_id = v_user,
        source = case when scout_creators.source = 'search' then 'search' else 'link' end,
        updated_at = now();
  return jsonb_build_object('status', 'applied', 'company_id', v_company);
end;
$$;

revoke execute on function public.scout_claim(text, text) from public, anon;
grant execute on function public.scout_claim(text, text) to authenticated;

-- Advance running scout runs every minute (Apify jobs finish on their own
-- time). The function returns at once when nothing is running.
select cron.unschedule('noni-scout-tick') where exists (select 1 from cron.job where jobname = 'noni-scout-tick');
select cron.schedule(
  'noni-scout-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/scout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (select 1 from public.scout_runs where status in ('planning', 'searching', 'enriching', 'vetting'));
  $cron$
);

-- Avatars and video covers, copied off the platforms' CDNs (their links
-- expire in days). Public: the Scout tab and Claude read them by URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scout', 'scout', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Revoking from public also took it from the service role, which the web
-- server uses for both.
grant execute on function public.scout_join_slug(uuid) to service_role;
grant execute on function public.marketplace_join(uuid, uuid) to service_role;
