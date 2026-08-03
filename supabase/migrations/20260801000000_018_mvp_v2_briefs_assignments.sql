-- MVP v2 milestone 1: briefs / campaigns / assignments schema.
-- briefs: the reusable creative unit. assignments: creator x brief x date,
-- owns status, submission, post link, metrics, bounty state. campaigns
-- (existing table) gains the weekly drop fields. content_tasks stays in
-- place behind the legacy flag; its rows are migrated into assignments.

-- ---------------------------------------------------------------------------
-- briefs

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  format text not null default 'video'
    check (format in ('video', 'photo_carousel')),
  title text not null,
  hook text,
  script text,
  caption text,
  example_url text,
  example_transcript text,
  why_it_works text,
  created_by uuid references public.profiles,
  archived_at timestamptz,
  created_at timestamptz default now()
);

create index briefs_company_created on public.briefs (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- campaigns: weekly drop fields on the existing table

alter table public.campaigns
  add column drop_date date,
  add column status text not null default 'draft'
    check (status in ('draft', 'published')),
  add column published_at timestamptz;

-- ---------------------------------------------------------------------------
-- campaign_briefs join table

create table public.campaign_briefs (
  campaign_id uuid not null references public.campaigns,
  brief_id uuid not null references public.briefs,
  company_id uuid not null references public.companies,
  -- 0-6 offset from campaign drop_date; pinned briefs land here for everyone.
  pinned_day int check (pinned_day between 0 and 6),
  created_at timestamptz default now(),
  primary key (campaign_id, brief_id)
);

create index campaign_briefs_brief on public.campaign_briefs (brief_id);

-- ---------------------------------------------------------------------------
-- assignments

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  campaign_id uuid references public.campaigns,
  brief_id uuid not null references public.briefs,
  creator_id uuid not null references public.profiles,
  scheduled_date date not null,
  slot_index int not null default 0,
  status text not null default 'assigned'
    check (status in ('assigned', 'recorded', 'submitted', 'changes_requested', 'approved', 'posted')),
  -- Fields migrated off content_tasks: latest submission, live post, metrics
  -- snapshot, bounty state.
  submission_id uuid references public.submissions,
  post_url text,
  metrics jsonb,
  bounty_credited_at timestamptz,
  bounty_amount_cents int,
  -- Provenance for rows migrated from content_tasks. Null for published rows.
  task_id uuid references public.content_tasks,
  created_at timestamptz default now()
);

-- Publish idempotency: one assignment per creator per brief per campaign.
-- Legacy rows have null campaign_id and never collide (nulls are distinct).
create unique index assignments_campaign_creator_brief
  on public.assignments (campaign_id, creator_id, brief_id);

create index assignments_creator_date
  on public.assignments (creator_id, scheduled_date, slot_index);

create index assignments_company_status
  on public.assignments (company_id, status);

-- ---------------------------------------------------------------------------
-- RLS (same pattern as content_tasks)

alter table public.briefs enable row level security;
alter table public.campaign_briefs enable row level security;
alter table public.assignments enable row level security;

create policy "same company read briefs" on public.briefs for select
  using (company_id = public.current_company_id());

create policy "admins write briefs" on public.briefs for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read campaign briefs" on public.campaign_briefs for select
  using (company_id = public.current_company_id());

create policy "admins write campaign briefs" on public.campaign_briefs for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read assignments" on public.assignments for select
  using (company_id = public.current_company_id());

create policy "admins write assignments" on public.assignments for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "creators update own assignments" on public.assignments for update
  using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
    and public.current_role() = 'creator'
  )
  with check (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Backfill: content_tasks -> briefs + assignments.
-- Each migrated brief reuses its source task's uuid, which keeps the
-- task -> brief correlation without an extra column.

insert into public.briefs (
  id, company_id, format, title, hook, script, caption,
  example_url, example_transcript, why_it_works, created_by, created_at
)
select
  t.id,
  t.company_id,
  coalesce(t.format, 'video'),
  t.title,
  t.hook,
  t.script,
  t.caption,
  tr.source_url,
  tr.transcript,
  t.brief,
  t.created_by,
  t.created_at
from public.content_tasks t
left join public.trend_items tr on tr.id = t.inspiration_trend_id;

insert into public.assignments (
  company_id, campaign_id, brief_id, creator_id, scheduled_date, slot_index,
  status, submission_id, post_url, metrics, bounty_credited_at,
  bounty_amount_cents, task_id, created_at
)
select
  t.company_id,
  t.campaign_id,
  t.id,
  t.assigned_to,
  coalesce(t.scheduled_for, t.due_date, t.created_at::date),
  t.slot_index,
  t.status,
  s.id,
  p.post_url,
  case when pm.post_id is null then null else jsonb_build_object(
    'views', pm.views,
    'likes', pm.likes,
    'comments', pm.comments,
    'shares', pm.shares,
    'fetched_at', pm.fetched_at
  ) end,
  wl.created_at,
  wl.amount_cents,
  t.id,
  t.created_at
from public.content_tasks t
left join lateral (
  select id from public.submissions
  where task_id = t.id
  order by version desc, created_at desc
  limit 1
) s on true
left join lateral (
  select id, post_url from public.posts
  where task_id = t.id
  order by posted_at desc
  limit 1
) p on true
left join lateral (
  select post_id, views, likes, comments, shares, fetched_at
  from public.post_metrics
  where post_id = p.id
  order by fetched_at desc
  limit 1
) pm on true
left join lateral (
  select created_at, amount_cents from public.wallet_ledger
  where post_id = p.id and kind = 'bounty_credit'
  limit 1
) wl on true
where t.assigned_to is not null
  and t.status is not null;

-- ---------------------------------------------------------------------------
-- Publish transaction. The edge function computes the deterministic layout
-- in TypeScript and hands the rows here so inserts + the status flip commit
-- atomically. Rerunning with the same layout is a no-op per row.

create or replace function public.publish_campaign_assignments(
  p_campaign_id uuid,
  p_assignments jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_inserted int;
begin
  select company_id into v_company
  from public.campaigns
  where id = p_campaign_id;

  if v_company is null then
    raise exception 'campaign not found';
  end if;

  if v_company <> public.current_company_id() or not public.is_admin() then
    raise exception 'forbidden';
  end if;

  insert into public.assignments (
    company_id, campaign_id, brief_id, creator_id, scheduled_date, slot_index
  )
  select
    v_company,
    p_campaign_id,
    (a->>'brief_id')::uuid,
    (a->>'creator_id')::uuid,
    (a->>'scheduled_date')::date,
    (a->>'slot_index')::int
  from jsonb_array_elements(p_assignments) a
  on conflict (campaign_id, creator_id, brief_id) do nothing;

  get diagnostics v_inserted = row_count;

  update public.campaigns
  set status = 'published',
      published_at = coalesce(published_at, now())
  where id = p_campaign_id;

  return v_inserted;
end;
$$;

revoke execute on function public.publish_campaign_assignments(uuid, jsonb) from anon;
