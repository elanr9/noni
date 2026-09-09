-- A brief week is seven days that begin when its first post is published,
-- not on the planned drop date. The first posts row for a campaign stamps
-- week_started_at and moves drop_date onto that day (company local time), so
-- every existing drop_date reader picks up the real start.

alter table public.campaigns
  add column week_started_at timestamptz;

create or replace function public.start_brief_week_on_first_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_settings jsonb;
begin
  if new.assignment_id is null or new.posted_at is null then
    return new;
  end if;

  select a.campaign_id into v_campaign_id
  from public.assignments a
  where a.id = new.assignment_id;
  if v_campaign_id is null then
    return new;
  end if;

  select c.settings into v_settings
  from public.campaigns cp
  join public.companies c on c.id = cp.company_id
  where cp.id = v_campaign_id;

  update public.campaigns
  set
    week_started_at = new.posted_at,
    drop_date = (new.posted_at at time zone coalesce(v_settings->>'timezone', 'America/Chicago'))::date
  where id = v_campaign_id
    and week_started_at is null;

  return new;
end;
$$;

drop trigger if exists posts_start_brief_week on public.posts;
create trigger posts_start_brief_week
  after insert on public.posts
  for each row execute function public.start_brief_week_on_first_post();
