-- 155: The marketplace.
--
-- Noni is the software and the place creators and companies find each other.
-- Every approved creator has a resume (creator_profiles, migration 154). A
-- company opens a campaign with its contract attached. A creator applies and
-- signs that contract on the spot; the company accepts or declines. Accepted
-- means the creator is a member of the company (company_members), the signed
-- contract is on file and they have a start date. A company can also reach
-- out first: an invite is a pre-approved application, so the creator signs
-- and is in.
--
-- marketplace_listings       a company's open campaign: pitch, what it wants,
--                            and the contract a creator signs to apply
-- marketplace_applications   one per creator per listing, applied or invited,
--                            with the contract as signed
-- marketplace_matches        the AI's score and one line of why, per creator
--                            per listing (edge function marketplace-match)
--
-- Everything is written through the functions below; the tables are read
-- only to clients.

-- ---------------------------------------------------------------------------
-- 1. Resume fields companies filter on
-- ---------------------------------------------------------------------------

alter table public.creator_profiles
  add column if not exists gender text
    check (gender in ('female', 'male', 'nonbinary', 'undisclosed')),
  add column if not exists birth_year int
    check (birth_year between 1920 and 2030),
  add column if not exists location text,
  add column if not exists tiktok_followers int check (tiktok_followers >= 0),
  add column if not exists instagram_followers int check (instagram_followers >= 0),
  -- Shown to companies in the marketplace. A creator can hide.
  add column if not exists listed boolean not null default true;

create index if not exists creator_profiles_niches_idx
  on public.creator_profiles using gin (niches);

-- A creator writes their own resume. Invited creators never went through the
-- apply chat, so this creates the row when there is none.
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
    raise exception 'That birth year does not look right';
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
    experience = case when p_patch ->> 'experience' in ('pro', 'some', 'new') then p_patch ->> 'experience' else c.experience end,
    best_campaign = case when p_patch ? 'best_campaign' then nullif(trim(p_patch ->> 'best_campaign'), '') else c.best_campaign end,
    niches = case when jsonb_typeof(p_patch -> 'niches') = 'array'
      then coalesce((select array_agg(distinct lower(trim(v))) from jsonb_array_elements_text(p_patch -> 'niches') v where trim(v) <> ''), '{}')
      else c.niches end,
    portfolio = case when jsonb_typeof(p_patch -> 'portfolio') = 'array' then p_patch -> 'portfolio' else c.portfolio end,
    bio = case when p_patch ? 'bio' then nullif(left(trim(p_patch ->> 'bio'), 600), '') else c.bio end,
    gender = case when p_patch ? 'gender' then v_gender else c.gender end,
    birth_year = case when p_patch ? 'birth_year' then v_year else c.birth_year end,
    location = case when p_patch ? 'location' then nullif(left(trim(p_patch ->> 'location'), 80), '') else c.location end,
    tiktok_followers = case when p_patch ? 'tiktok_followers' then greatest(0, nullif(p_patch ->> 'tiktok_followers', '')::int) else c.tiktok_followers end,
    instagram_followers = case when p_patch ? 'instagram_followers' then greatest(0, nullif(p_patch ->> 'instagram_followers', '')::int) else c.instagram_followers end,
    listed = case when jsonb_typeof(p_patch -> 'listed') = 'boolean' then (p_patch ->> 'listed')::boolean else c.listed end,
    updated_at = now()
  where c.user_id = v_uid
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Listings
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_listings (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies on delete cascade,
  status            text not null default 'draft'
    check (status in ('draft', 'open', 'paused', 'closed')),
  title             text not null,
  tagline           text,
  about             text,
  requirements      text,
  niches            text[] not null default '{}',
  platforms         text[] not null default '{}',
  posts_per_week    int not null default 3 check (posts_per_week between 1 and 50),
  -- How many creators it wants; null is no limit.
  spots             int check (spots > 0),
  min_age           int not null default 18 check (min_age between 18 and 99),
  -- Days from acceptance to the first post.
  start_days        int not null default 3 check (start_days between 0 and 60),
  contract_title    text not null default 'Creator agreement',
  contract_body     text not null default '',
  contract_version  int not null default 1,
  created_by        uuid references public.profiles on delete set null,
  opened_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists marketplace_listings_company_idx
  on public.marketplace_listings (company_id);
create index if not exists marketplace_listings_open_idx
  on public.marketplace_listings (opened_at desc) where status = 'open';

alter table public.marketplace_listings enable row level security;

drop policy if exists marketplace_listings_read on public.marketplace_listings;
create policy marketplace_listings_read on public.marketplace_listings
  for select to authenticated
  using (status = 'open' or public.is_member_of(company_id));

-- ---------------------------------------------------------------------------
-- 3. Applications and invites
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_applications (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.marketplace_listings on delete cascade,
  company_id        uuid not null references public.companies on delete cascade,
  creator_id        uuid not null references public.profiles on delete cascade,
  origin            text not null check (origin in ('applied', 'invited')),
  status            text not null
    check (status in ('invited', 'applied', 'accepted', 'declined', 'withdrawn')),
  -- The creator's pitch to the company.
  note              text,
  -- The company's message when it reached out first.
  invite_message    text,
  invited_by        uuid references public.profiles on delete set null,
  -- The contract exactly as the creator signed it.
  contract_title    text,
  contract_body     text,
  contract_version  int,
  contract_sha256   text,
  signed_name       text,
  signed_at         timestamptz,
  decided_by        uuid references public.profiles on delete set null,
  decided_at        timestamptz,
  decision_note     text,
  -- The day the creator starts posting, set on acceptance.
  start_date        date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (listing_id, creator_id)
);

create index if not exists marketplace_applications_company_idx
  on public.marketplace_applications (company_id, status, updated_at desc);
create index if not exists marketplace_applications_creator_idx
  on public.marketplace_applications (creator_id, updated_at desc);

alter table public.marketplace_applications enable row level security;

drop policy if exists marketplace_applications_read on public.marketplace_applications;
create policy marketplace_applications_read on public.marketplace_applications
  for select to authenticated
  using (
    creator_id = auth.uid()
    or public.is_platform_admin()
    or (company_id = public.current_company_id() and public.is_campaign_manager())
  );

create table if not exists public.marketplace_matches (
  listing_id   uuid not null references public.marketplace_listings on delete cascade,
  creator_id   uuid not null references public.profiles on delete cascade,
  score        int not null check (score between 0 and 100),
  reason       text,
  computed_at  timestamptz not null default now(),
  primary key (listing_id, creator_id)
);

alter table public.marketplace_matches enable row level security;

drop policy if exists marketplace_matches_read on public.marketplace_matches;
create policy marketplace_matches_read on public.marketplace_matches
  for select to authenticated
  using (
    exists (
      select 1 from public.marketplace_listings l
      where l.id = marketplace_matches.listing_id
        and l.company_id = public.current_company_id()
        and public.is_campaign_manager()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

-- The agreement a new listing starts with. The company edits it; the pay
-- lines match creator_pay_rates() (migration 144).
create or replace function public.default_creator_contract(p_company text, p_posts_per_week int, p_start_days int)
returns text
language sql
immutable
set search_path = public
as $$
  select format(
$c$This agreement is between %1$s ("the Company") and you ("the Creator"). It starts the day the Company accepts your application.

1. The work. You make short videos and posts for the Company from the briefs it gives you in Noni, and post them on your own accounts. The target is %2$s posts a week. Your first post is due within %3$s days of being accepted.

2. Pay. You earn $10 for each video and $5 for each static post once it is live, plus $1 for every 1,000 views in the first 30 days, up to $500 in view pay per post. Noni pays out to your bank every Sunday.

3. Approval. Every post is reviewed in Noni before it goes live. Only approved posts are paid. Posts must stay up for at least 90 days.

4. Content rights. You keep ownership of what you make. You give the Company a worldwide, royalty free licence to repost, edit and run your content as ads, with no end date, for the content you make under this agreement.

5. Honesty. You follow the brief, say only what the brief allows about the product, and label the content as a paid partnership where the platform or the law requires it. No bought views, likes or followers.

6. Independent creator. You are an independent contractor, not an employee. You are responsible for your own taxes. You are 18 or older.

7. Ending it. Either side can end this agreement at any time in Noni. Posts approved before it ends are still paid.

Typing your name below and tapping Sign has the same effect as a handwritten signature.$c$,
    coalesce(nullif(trim(p_company), ''), 'the Company'),
    greatest(1, coalesce(p_posts_per_week, 3)),
    greatest(0, coalesce(p_start_days, 3))
  );
$$;

-- Membership for a creator who was accepted or took an invite. Mirrors the
-- creator branch of apply_invite_membership.
create or replace function public.marketplace_join(p_company_id uuid, p_creator_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_members (company_id, profile_id, role, permissions, can_create)
  values (p_company_id, p_creator_id, 'creator', public.default_member_permissions(), false)
  on conflict (company_id, profile_id) do update
    set
      role = case
        when company_members.removed_at is not null then 'creator'
        else company_members.role
      end,
      permissions = case
        when company_members.removed_at is not null then public.default_member_permissions()
        else company_members.permissions
      end,
      can_create = case
        when company_members.removed_at is not null then false
        when company_members.role in ('campaign_manager', 'company_admin') then true
        else company_members.can_create
      end,
      removed_at = null;

  -- First company: it becomes the one the app opens on.
  update public.profiles p
    set active_company_id = p_company_id,
        role = case when p.role = 'admin' then 'admin' else 'creator' end
    where p.id = p_creator_id and p.active_company_id is null;
end;
$$;

revoke execute on function public.marketplace_join(uuid, uuid) from public, anon, authenticated;

create or replace function public.marketplace_notify(
  p_company_id uuid, p_profile_ids uuid[], p_event text, p_title text, p_body text, p_link text, p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A notification must never fail the action it reports.
  begin
    insert into public.notifications (company_id, profile_id, event, title, body, deep_link, data)
    select p_company_id, pid, p_event, p_title, p_body, p_link,
           p_data || jsonb_build_object('event', p_event, 'company_id', p_company_id, 'deep_link', p_link)
    from unnest(p_profile_ids) pid;
  exception when others then
    raise warning 'marketplace_notify: %', sqlerrm;
  end;
end;
$$;

revoke execute on function public.marketplace_notify(uuid, uuid[], text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.marketplace_manager_ids(p_company_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.profile_id), '{}')
  from public.company_members m
  where m.company_id = p_company_id
    and m.removed_at is null
    and m.role in ('campaign_manager', 'company_admin');
$$;

revoke execute on function public.marketplace_manager_ids(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Company side: the listing
-- ---------------------------------------------------------------------------

create or replace function public.save_marketplace_listing(p_id uuid, p_patch jsonb)
returns public.marketplace_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company public.companies;
  v_row public.marketplace_listings;
  v_status text;
  v_body text;
begin
  if auth.uid() is null or v_company_id is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;
  select * into v_company from public.companies where id = v_company_id;

  if p_id is null then
    insert into public.marketplace_listings (company_id, title, created_by, contract_body)
    values (
      v_company_id,
      coalesce(nullif(trim(p_patch ->> 'title'), ''), v_company.name || ' creators'),
      auth.uid(),
      public.default_creator_contract(v_company.name, coalesce(nullif(p_patch ->> 'posts_per_week', '')::int, 3), coalesce(nullif(p_patch ->> 'start_days', '')::int, 3))
    )
    returning * into v_row;
  else
    select * into v_row from public.marketplace_listings
      where id = p_id and company_id = v_company_id for update;
    if v_row.id is null then
      raise exception 'listing not found';
    end if;
  end if;

  v_status := coalesce(nullif(p_patch ->> 'status', ''), v_row.status);
  if v_status not in ('draft', 'open', 'paused', 'closed') then
    raise exception 'unknown status';
  end if;
  v_body := case when p_patch ? 'contract_body' then coalesce(p_patch ->> 'contract_body', '') else v_row.contract_body end;
  if v_status = 'open' and length(trim(v_body)) < 40 then
    raise exception 'Add the agreement creators sign before opening the campaign';
  end if;

  update public.marketplace_listings l set
    title = coalesce(nullif(left(trim(p_patch ->> 'title'), 80), ''), l.title),
    tagline = case when p_patch ? 'tagline' then nullif(left(trim(p_patch ->> 'tagline'), 140), '') else l.tagline end,
    about = case when p_patch ? 'about' then nullif(left(trim(p_patch ->> 'about'), 2000), '') else l.about end,
    requirements = case when p_patch ? 'requirements' then nullif(left(trim(p_patch ->> 'requirements'), 1000), '') else l.requirements end,
    niches = case when jsonb_typeof(p_patch -> 'niches') = 'array'
      then coalesce((select array_agg(distinct lower(trim(v))) from jsonb_array_elements_text(p_patch -> 'niches') v where trim(v) <> ''), '{}')
      else l.niches end,
    platforms = case when jsonb_typeof(p_patch -> 'platforms') = 'array'
      then coalesce((select array_agg(distinct lower(trim(v))) from jsonb_array_elements_text(p_patch -> 'platforms') v where trim(v) <> ''), '{}')
      else l.platforms end,
    posts_per_week = coalesce(nullif(p_patch ->> 'posts_per_week', '')::int, l.posts_per_week),
    spots = case when p_patch ? 'spots' then nullif(p_patch ->> 'spots', '')::int else l.spots end,
    min_age = greatest(18, coalesce(nullif(p_patch ->> 'min_age', '')::int, l.min_age)),
    start_days = coalesce(nullif(p_patch ->> 'start_days', '')::int, l.start_days),
    contract_title = coalesce(nullif(left(trim(p_patch ->> 'contract_title'), 80), ''), l.contract_title),
    contract_body = v_body,
    -- A changed agreement is a new version; signed copies keep their own text.
    contract_version = case when v_body is distinct from l.contract_body and p_id is not null then l.contract_version + 1 else l.contract_version end,
    status = v_status,
    opened_at = case when v_status = 'open' and l.status <> 'open' then now() else l.opened_at end,
    updated_at = now()
  where l.id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- Reach out: a pre-approved application the creator only has to sign.
create or replace function public.invite_creator_to_listing(p_listing_id uuid, p_creator_id uuid, p_message text default null)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.marketplace_listings;
  v_company public.companies;
  v_app public.marketplace_applications;
begin
  if auth.uid() is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;
  select * into v_listing from public.marketplace_listings
    where id = p_listing_id and company_id = public.current_company_id();
  if v_listing.id is null then
    raise exception 'listing not found';
  end if;
  if length(trim(v_listing.contract_body)) < 40 then
    raise exception 'Add the agreement creators sign before inviting';
  end if;
  if not exists (select 1 from public.profiles where id = p_creator_id) then
    raise exception 'creator not found';
  end if;
  if exists (
    select 1 from public.company_members m
    where m.company_id = v_listing.company_id and m.profile_id = p_creator_id
      and m.removed_at is null and (m.role = 'creator' or m.can_create)
  ) then
    raise exception 'They already create for you';
  end if;

  select * into v_app from public.marketplace_applications
    where listing_id = p_listing_id and creator_id = p_creator_id for update;
  if v_app.id is not null and v_app.status = 'applied' then
    raise exception 'They already applied. Accept them from Applicants.';
  end if;

  insert into public.marketplace_applications (listing_id, company_id, creator_id, origin, status, invite_message, invited_by)
  values (p_listing_id, v_listing.company_id, p_creator_id, 'invited', 'invited', nullif(left(trim(p_message), 600), ''), auth.uid())
  on conflict (listing_id, creator_id) do update
    set origin = 'invited', status = 'invited',
        invite_message = excluded.invite_message, invited_by = excluded.invited_by,
        signed_name = null, signed_at = null, contract_body = null, contract_title = null,
        contract_version = null, contract_sha256 = null,
        decided_by = null, decided_at = null, decision_note = null, start_date = null,
        updated_at = now()
  returning * into v_app;

  select * into v_company from public.companies where id = v_listing.company_id;
  perform public.marketplace_notify(
    v_listing.company_id, array[p_creator_id], 'marketplace_invite',
    v_company.name || ' wants you',
    coalesce(v_app.invite_message, 'They invited you to ' || v_listing.title || '. Sign the agreement and you are in.'),
    'noni://creator/' || v_listing.company_id || '/market/' || v_listing.id,
    jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id)
  );
  return v_app;
end;
$$;

create or replace function public.decide_marketplace_application(
  p_id uuid, p_accept boolean, p_note text default null, p_start_date date default null
)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.marketplace_applications;
  v_listing public.marketplace_listings;
  v_company public.companies;
  v_start date;
begin
  if auth.uid() is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;
  select * into v_app from public.marketplace_applications
    where id = p_id and company_id = public.current_company_id() for update;
  if v_app.id is null then
    raise exception 'application not found';
  end if;
  if v_app.status = 'accepted' then
    return v_app;
  end if;
  if v_app.status <> 'applied' then
    raise exception 'This application is not waiting on you';
  end if;
  select * into v_listing from public.marketplace_listings where id = v_app.listing_id;
  select * into v_company from public.companies where id = v_app.company_id;

  if p_accept then
    if v_app.signed_at is null then
      raise exception 'The creator has not signed yet';
    end if;
    if v_listing.spots is not null and (
      select count(*) from public.marketplace_applications a
      where a.listing_id = v_listing.id and a.status = 'accepted'
    ) >= v_listing.spots then
      raise exception 'Every spot on this campaign is taken. Raise the number of spots to accept more.';
    end if;
    v_start := greatest(coalesce(p_start_date, current_date + v_listing.start_days), current_date);
    perform public.marketplace_join(v_app.company_id, v_app.creator_id);
    update public.marketplace_applications
      set status = 'accepted', decided_by = auth.uid(), decided_at = now(),
          decision_note = nullif(trim(p_note), ''), start_date = v_start, updated_at = now()
      where id = p_id returning * into v_app;
    perform public.marketplace_notify(
      v_app.company_id, array[v_app.creator_id], 'marketplace_accepted',
      'You are in with ' || v_company.name,
      'Your agreement is signed. First post due ' || to_char(v_start, 'FMDay, FMMonth FMDD') || '.',
      'noni://creator/' || v_app.company_id || '/home',
      jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id)
    );
  else
    update public.marketplace_applications
      set status = 'declined', decided_by = auth.uid(), decided_at = now(),
          decision_note = nullif(trim(p_note), ''), updated_at = now()
      where id = p_id returning * into v_app;
    perform public.marketplace_notify(
      v_app.company_id, array[v_app.creator_id], 'marketplace_declined',
      v_company.name || ' passed this time',
      'Plenty more campaigns are open in the marketplace.',
      'noni://creator/' || v_app.company_id || '/market',
      jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id)
    );
  end if;
  return v_app;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Creator side: browse, sign, apply
-- ---------------------------------------------------------------------------

-- Open campaigns plus any the caller has a history with.
create or replace function public.marketplace_feed()
returns table (
  id uuid, company_id uuid, company_name text, company_website text,
  status text, title text, tagline text, about text, requirements text,
  niches text[], platforms text[], posts_per_week int, spots int, spots_left int,
  min_age int, start_days int, contract_title text, contract_body text, contract_version int,
  opened_at timestamptz, creator_count int, is_member boolean,
  application_id uuid, application_status text, application_origin text,
  invite_message text, signed_at timestamptz, start_date date, decision_note text,
  niche_overlap int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id, l.company_id, c.name, c.website,
    l.status, l.title, l.tagline, l.about, l.requirements,
    l.niches, l.platforms, l.posts_per_week, l.spots,
    case when l.spots is null then null
      else greatest(0, l.spots - (select count(*)::int from public.marketplace_applications x where x.listing_id = l.id and x.status = 'accepted')) end,
    l.min_age, l.start_days, l.contract_title, l.contract_body, l.contract_version,
    l.opened_at,
    (select count(*)::int from public.company_members m
      where m.company_id = l.company_id and m.removed_at is null and (m.role = 'creator' or m.can_create)),
    exists (select 1 from public.company_members m
      where m.company_id = l.company_id and m.profile_id = auth.uid() and m.removed_at is null),
    a.id, a.status, a.origin, a.invite_message, a.signed_at, a.start_date, a.decision_note,
    (select count(*)::int from unnest(l.niches) n where n = any (coalesce(cp.niches, '{}')))
  from public.marketplace_listings l
  join public.companies c on c.id = l.company_id
  left join public.marketplace_applications a on a.listing_id = l.id and a.creator_id = auth.uid()
  left join public.creator_profiles cp on cp.user_id = auth.uid()
  where auth.uid() is not null
    and (l.status = 'open' or a.id is not null)
  order by (a.status = 'invited') desc nulls last, l.opened_at desc nulls last;
$$;

-- Sign the agreement and apply. Taking an invite is the same call: the
-- company already said yes, so the creator is in the moment they sign.
create or replace function public.apply_to_listing(p_listing_id uuid, p_signed_name text, p_note text default null)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.marketplace_listings;
  v_company public.companies;
  v_profile public.profiles;
  v_cp public.creator_profiles;
  v_app public.marketplace_applications;
  v_name text := regexp_replace(trim(coalesce(p_signed_name, '')), '\s+', ' ', 'g');
  v_age int;
  v_invited boolean;
  v_start date;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null then
    raise exception 'Your account is still in review';
  end if;
  select * into v_listing from public.marketplace_listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'campaign not found';
  end if;
  select * into v_app from public.marketplace_applications
    where listing_id = p_listing_id and creator_id = v_uid for update;
  v_invited := v_app.id is not null and v_app.status = 'invited';

  if v_listing.status <> 'open' and not v_invited then
    raise exception 'This campaign is not taking applications right now';
  end if;
  if v_app.id is not null and v_app.status in ('applied', 'accepted') then
    return v_app;
  end if;
  if exists (
    select 1 from public.company_members m
    where m.company_id = v_listing.company_id and m.profile_id = v_uid
      and m.removed_at is null and (m.role = 'creator' or m.can_create)
  ) then
    raise exception 'You already create for this company';
  end if;

  select * into v_cp from public.creator_profiles where user_id = v_uid;
  if v_cp.birth_year is null then
    raise exception 'Add your age to your profile before you sign';
  end if;
  v_age := extract(year from now())::int - v_cp.birth_year;
  if v_age < greatest(18, v_listing.min_age) then
    raise exception 'This campaign is for creators % and older', greatest(18, v_listing.min_age);
  end if;
  if coalesce(v_cp.tiktok, v_cp.instagram) is null then
    raise exception 'Add your TikTok or Instagram to your profile before you apply';
  end if;
  if length(v_name) < 3 or position(' ' in v_name) = 0 then
    raise exception 'Type your full legal name to sign';
  end if;
  if length(trim(v_listing.contract_body)) < 40 then
    raise exception 'This campaign has no agreement yet';
  end if;

  insert into public.marketplace_applications (
    listing_id, company_id, creator_id, origin, status, note,
    contract_title, contract_body, contract_version, contract_sha256, signed_name, signed_at
  ) values (
    p_listing_id, v_listing.company_id, v_uid, 'applied', 'applied', nullif(left(trim(p_note), 600), ''),
    v_listing.contract_title, v_listing.contract_body, v_listing.contract_version,
    encode(sha256(convert_to(v_listing.contract_body, 'UTF8')), 'hex'), v_name, now()
  )
  on conflict (listing_id, creator_id) do update
    set status = 'applied',
        note = coalesce(excluded.note, marketplace_applications.note),
        contract_title = excluded.contract_title, contract_body = excluded.contract_body,
        contract_version = excluded.contract_version, contract_sha256 = excluded.contract_sha256,
        signed_name = excluded.signed_name, signed_at = excluded.signed_at,
        decided_by = null, decided_at = null, decision_note = null, start_date = null,
        updated_at = now()
  returning * into v_app;

  select * into v_company from public.companies where id = v_listing.company_id;

  if v_invited then
    v_start := current_date + v_listing.start_days;
    perform public.marketplace_join(v_listing.company_id, v_uid);
    update public.marketplace_applications
      set status = 'accepted', decided_at = now(), decided_by = invited_by, start_date = v_start, updated_at = now()
      where id = v_app.id returning * into v_app;
    perform public.marketplace_notify(
      v_listing.company_id, public.marketplace_manager_ids(v_listing.company_id), 'marketplace_invite_accepted',
      coalesce(v_profile.full_name, 'A creator') || ' joined',
      'They signed your agreement and start ' || to_char(v_start, 'FMMonth FMDD') || '.',
      'noni://manager/' || v_listing.company_id || '/creator/' || v_uid,
      jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id, 'creator_id', v_uid)
    );
  else
    perform public.marketplace_notify(
      v_listing.company_id, public.marketplace_manager_ids(v_listing.company_id), 'marketplace_application',
      coalesce(v_profile.full_name, 'A creator') || ' applied',
      'Signed and ready. Accept or pass in Market.',
      'noni://manager/' || v_listing.company_id || '/market',
      jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id, 'creator_id', v_uid)
    );
  end if;
  return v_app;
end;
$$;

-- Withdraw an application, or pass on an invite.
create or replace function public.withdraw_marketplace_application(p_id uuid)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.marketplace_applications;
begin
  update public.marketplace_applications
    set status = 'withdrawn', updated_at = now()
    where id = p_id and creator_id = auth.uid() and status in ('applied', 'invited')
    returning * into v_app;
  if v_app.id is null then
    raise exception 'Nothing to withdraw';
  end if;
  return v_app;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Company side: every creator, with the numbers to sort by
-- ---------------------------------------------------------------------------

-- One row per listed creator, as a given company and listing see them. Not
-- callable by clients; marketplace_creators checks the caller first and the
-- matching function reads it with the service role.
create or replace function public.marketplace_creator_rows(p_company_id uuid, p_listing_id uuid)
returns table (
  creator_id uuid, full_name text, avatar_path text,
  age int, gender text, location text, bio text,
  instagram text, tiktok text, followers int,
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
      case when cp.tiktok_followers is null and cp.instagram_followers is null then null
        else coalesce(cp.tiktok_followers, 0) + coalesce(cp.instagram_followers, 0) end as followers,
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
    b.instagram, b.tiktok, b.followers, b.experience, b.campaigns_done, b.best_campaign,
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

-- The directory a manager browses. p_scope: 'all' every listed creator,
-- 'applicants' people waiting on a decision, 'invited' people the company
-- reached out to.
create or replace function public.marketplace_creators(
  p_listing_id uuid default null,
  p_scope text default 'all',
  p_search text default null,
  p_niches text[] default null,
  p_gender text default null,
  p_min_age int default null,
  p_max_age int default null,
  p_min_views bigint default null,
  p_min_earned_cents bigint default null,
  p_min_followers int default null,
  p_experience text default null,
  p_sort text default 'match',
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_out jsonb;
begin
  if auth.uid() is null or v_company_id is null or not public.is_campaign_manager() then
    raise exception 'managers only' using errcode = '42501';
  end if;

  with rows as (
    select r.* from public.marketplace_creator_rows(v_company_id, p_listing_id) r
    where (case coalesce(p_scope, 'all')
        when 'applicants' then r.application_status = 'applied'
        when 'invited' then r.application_status = 'invited'
        -- Browsing: people who are not on the team yet.
        else not r.is_member
      end)
      and (p_search is null or trim(p_search) = ''
        or r.full_name ilike '%' || trim(p_search) || '%'
        or r.tiktok ilike '%' || trim(leading '@' from trim(p_search)) || '%'
        or r.instagram ilike '%' || trim(leading '@' from trim(p_search)) || '%')
      and (p_niches is null or cardinality(p_niches) = 0 or r.niches && p_niches)
      and (p_gender is null or r.gender = p_gender)
      and (p_min_age is null or r.age >= p_min_age)
      and (p_max_age is null or r.age <= p_max_age)
      and (p_min_views is null or r.total_views >= p_min_views)
      and (p_min_earned_cents is null or r.total_earned_cents >= p_min_earned_cents)
      and (p_min_followers is null or coalesce(r.followers, 0) >= p_min_followers)
      and (p_experience is null or r.experience = p_experience)
  ),
  page as (
    select * from rows r
    order by
      case when p_sort = 'views' then r.total_views end desc nulls last,
      case when p_sort = 'earned' then r.total_earned_cents end desc nulls last,
      case when p_sort = 'followers' then r.followers end desc nulls last,
      case when p_sort = 'newest' then extract(epoch from coalesce(r.applied_at, r.joined_at)) end desc nulls last,
      r.match_score desc, r.total_views desc, r.joined_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 300)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'rows', coalesce((select jsonb_agg(to_jsonb(p)) from page p), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.save_creator_profile(jsonb) from public, anon;
revoke execute on function public.save_marketplace_listing(uuid, jsonb) from public, anon;
revoke execute on function public.invite_creator_to_listing(uuid, uuid, text) from public, anon;
revoke execute on function public.decide_marketplace_application(uuid, boolean, text, date) from public, anon;
revoke execute on function public.marketplace_feed() from public, anon;
revoke execute on function public.apply_to_listing(uuid, text, text) from public, anon;
revoke execute on function public.withdraw_marketplace_application(uuid) from public, anon;
revoke execute on function public.marketplace_creators(uuid, text, text, text[], text, int, int, bigint, bigint, int, text, text, int, int) from public, anon;

grant execute on function public.save_creator_profile(jsonb) to authenticated;
grant execute on function public.save_marketplace_listing(uuid, jsonb) to authenticated;
grant execute on function public.invite_creator_to_listing(uuid, uuid, text) to authenticated;
grant execute on function public.decide_marketplace_application(uuid, boolean, text, date) to authenticated;
grant execute on function public.marketplace_feed() to authenticated;
grant execute on function public.apply_to_listing(uuid, text, text) to authenticated;
grant execute on function public.withdraw_marketplace_application(uuid) to authenticated;
grant execute on function public.marketplace_creators(uuid, text, text, text[], text, int, int, bigint, bigint, int, text, text, int, int) to authenticated;
grant execute on function public.default_creator_contract(text, int, int) to authenticated;
