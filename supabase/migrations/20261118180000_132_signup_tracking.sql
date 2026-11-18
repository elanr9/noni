-- Sign-up tracking for any company's own app.
--
-- Stripe only knows paying customers. A company's sign-ups live in its own
-- database (most often Supabase auth.users), so the company runs one SQL
-- snippet there: it posts daily counts of past sign-ups once, then one event
-- per new user, to the track-signup function with the company's key.
-- AGGREGATES ONLY: Noni stores a count per day and referral code, never a
-- user row.
--
-- signup_daily keeps the raw referral code so a creator's code can be added
-- (or moved) later and their past sign-ups follow. refresh_signups() turns it
-- into conversion_daily.new_accounts, which Analytics already reads; with
-- tracking on, that number comes from here rather than from Stripe customers.

create table if not exists public.company_signup_sources (
  company_id uuid primary key references public.companies on delete cascade,
  -- Noni's own write key for this company. Only lets the holder add to this
  -- company's sign-up counts.
  token text not null unique,
  created_at timestamptz not null default now(),
  last_event_at timestamptz
);

create table if not exists public.signup_daily (
  company_id uuid not null references public.companies on delete cascade,
  day date not null,
  -- Lower-cased referral code, '' when the sign-up carried none.
  code text not null default '',
  count int not null default 0,
  primary key (company_id, day, code)
);

-- Service role only: no policies.
alter table public.company_signup_sources enable row level security;
alter table public.signup_daily enable row level security;

-- Rebuilds conversion_daily.new_accounts from signup_daily for one company
-- from a day onward: the company-wide row per day, and a row per creator
-- whose code matches.
create or replace function public.refresh_signups(p_company uuid, p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversion_daily
  set new_accounts = 0
  where company_id = p_company and day >= p_from and new_accounts <> 0;

  insert into public.conversion_daily (company_id, creator_id, day, new_accounts, synced_at)
  select p_company, null, s.day, sum(s.count)::int, now()
  from public.signup_daily s
  where s.company_id = p_company and s.day >= p_from
  group by s.day
  on conflict (company_id, day, creator_id)
  do update set new_accounts = excluded.new_accounts, synced_at = excluded.synced_at;

  insert into public.conversion_daily (company_id, creator_id, day, new_accounts, synced_at)
  select p_company, l.creator_id, s.day, sum(s.count)::int, now()
  from public.signup_daily s
  join public.attribution_links l
    on l.company_id = s.company_id
   and lower(l.code) = s.code
   and l.creator_id is not null
   and l.task_id is null
   and l.assignment_id is null
  where s.company_id = p_company and s.day >= p_from and s.code <> ''
  group by l.creator_id, s.day
  on conflict (company_id, day, creator_id)
  do update set new_accounts = excluded.new_accounts, synced_at = excluded.synced_at;
end;
$$;

-- One call from track-signup. p_rows: [{ "day": "2026-11-18", "code": "maya10", "count": 3 }].
-- mode 'history' replaces everything up to the newest day sent (the snippet's
-- one-time backfill, safe to run again); 'events' adds to what is there.
create or replace function public.record_signups(p_company uuid, p_rows jsonb, p_mode text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date;
  v_to date;
  v_n int;
begin
  select min((r->>'day')::date), max((r->>'day')::date), count(*)
  into v_from, v_to, v_n
  from jsonb_array_elements(p_rows) r;

  if p_mode = 'history' then
    delete from public.signup_daily
    where company_id = p_company and (v_to is null or day <= v_to);
    v_from := '2000-01-01';
  end if;

  if v_n > 0 then
    insert into public.signup_daily (company_id, day, code, count)
    select p_company, (r->>'day')::date, lower(coalesce(r->>'code', '')), sum((r->>'count')::int)::int
    from jsonb_array_elements(p_rows) r
    group by 1, 2, 3
    on conflict (company_id, day, code)
    do update set count = public.signup_daily.count + excluded.count;
  end if;

  update public.company_signup_sources set last_event_at = now() where company_id = p_company;
  perform public.refresh_signups(p_company, coalesce(v_from, current_date));
  return v_n;
end;
$$;

revoke all on function public.refresh_signups(uuid, date) from public, anon, authenticated;
revoke all on function public.record_signups(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.refresh_signups(uuid, date) to service_role;
grant execute on function public.record_signups(uuid, jsonb, text) to service_role;

-- A creator's code added, changed or removed: their tracked sign-ups move at once.
create or replace function public.attribution_links_refresh_signups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := coalesce(new.company_id, old.company_id);
begin
  if exists (select 1 from public.company_signup_sources where company_id = v_company and last_event_at is not null) then
    perform public.refresh_signups(v_company, '2000-01-01');
  end if;
  return null;
end;
$$;

drop trigger if exists attribution_links_refresh_signups on public.attribution_links;
create trigger attribution_links_refresh_signups
  after insert or update or delete on public.attribution_links
  for each row execute function public.attribution_links_refresh_signups();

-- Analytics gate: the company's app is reporting sign-ups.
create or replace function public.signup_tracking_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_signup_sources s
    where s.company_id = public.current_company_id()
      and s.last_event_at is not null
      and public.is_campaign_manager()
  )
$$;

revoke all on function public.signup_tracking_on() from public, anon;
grant execute on function public.signup_tracking_on() to authenticated;
