-- Noni migration 001: schema, RLS, videos bucket

create extension if not exists "pgcrypto";

-- Tables

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  website text,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  company_id uuid not null references public.companies,
  role text not null check (role in ('admin', 'creator')),
  full_name text,
  avatar_path text,
  expo_push_token text,
  onboarded boolean default false,
  created_at timestamptz default now()
);

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  tone text,
  audience text,
  content_pillars jsonb,
  products jsonb,
  buying_path text,
  source_urls text[],
  updated_at timestamptz default now()
);

create table public.trend_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  platform text check (platform in ('tiktok', 'instagram')),
  source_url text,
  author_handle text,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  transcript text,
  hook text,
  why_it_works text,
  scraped_at timestamptz default now()
);

create table public.content_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  assigned_to uuid references public.profiles,
  created_by uuid references public.profiles,
  title text not null,
  script text,
  caption text,
  platforms text[] default '{tiktok,instagram}',
  inspiration_trend_id uuid references public.trend_items,
  due_date date,
  status text not null default 'assigned'
    check (status in ('assigned', 'recorded', 'submitted', 'changes_requested', 'approved', 'posted')),
  created_at timestamptz default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.content_tasks,
  creator_id uuid not null references public.profiles,
  video_path text not null,
  duration_seconds int,
  version int default 1,
  created_at timestamptz default now()
);

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions,
  reviewer_id uuid not null references public.profiles,
  action text check (action in ('approved', 'changes_requested', 'comment')),
  note text,
  created_at timestamptz default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.content_tasks,
  submission_id uuid not null references public.submissions,
  platform text,
  ayrshare_post_id text,
  post_url text,
  status text default 'posted',
  posted_at timestamptz default now()
);

create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  fetched_at timestamptz default now()
);

create table public.attribution_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  task_id uuid references public.content_tasks,
  creator_id uuid references public.profiles,
  code text unique not null,
  url text
);

create table public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  attribution_link_id uuid references public.attribution_links,
  stripe_event_id text unique,
  amount_cents int,
  occurred_at timestamptz default now()
);

-- Helpers for RLS

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

-- RLS

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.trend_items enable row level security;
alter table public.content_tasks enable row level security;
alter table public.submissions enable row level security;
alter table public.review_events enable row level security;
alter table public.posts enable row level security;
alter table public.post_metrics enable row level security;
alter table public.attribution_links enable row level security;
alter table public.revenue_events enable row level security;

-- companies
create policy "same company read" on public.companies for select
  using (id = public.current_company_id());

create policy "admins update company" on public.companies for update
  using (id = public.current_company_id() and public.is_admin());

-- profiles
create policy "same company read profiles" on public.profiles for select
  using (company_id = public.current_company_id());

create policy "admins write profiles" on public.profiles for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "users update own profile" on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- brand_profiles
create policy "same company read brand" on public.brand_profiles for select
  using (company_id = public.current_company_id());

create policy "admins write brand" on public.brand_profiles for all
  using (company_id = public.current_company_id() and public.is_admin());

-- trend_items
create policy "same company read trends" on public.trend_items for select
  using (company_id = public.current_company_id());

create policy "admins write trends" on public.trend_items for all
  using (company_id = public.current_company_id() and public.is_admin());

-- content_tasks
create policy "same company read tasks" on public.content_tasks for select
  using (company_id = public.current_company_id());

create policy "admins write tasks" on public.content_tasks for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "creators update assigned tasks" on public.content_tasks for update
  using (
    company_id = public.current_company_id()
    and assigned_to = auth.uid()
    and public.current_role() = 'creator'
  )
  with check (
    company_id = public.current_company_id()
    and assigned_to = auth.uid()
  );

-- submissions
create policy "same company read submissions" on public.submissions for select
  using (
    exists (
      select 1 from public.content_tasks t
      where t.id = submissions.task_id
        and t.company_id = public.current_company_id()
    )
  );

create policy "admins write submissions" on public.submissions for all
  using (
    public.is_admin()
    and exists (
      select 1 from public.content_tasks t
      where t.id = submissions.task_id
        and t.company_id = public.current_company_id()
    )
  );

create policy "creators insert own submissions" on public.submissions for insert
  with check (
    creator_id = auth.uid()
    and exists (
      select 1 from public.content_tasks t
      where t.id = task_id
        and t.company_id = public.current_company_id()
        and t.assigned_to = auth.uid()
    )
  );

-- review_events
create policy "same company read reviews" on public.review_events for select
  using (
    exists (
      select 1
      from public.submissions s
      join public.content_tasks t on t.id = s.task_id
      where s.id = review_events.submission_id
        and t.company_id = public.current_company_id()
    )
  );

create policy "admins write reviews" on public.review_events for all
  using (
    public.is_admin()
    and exists (
      select 1
      from public.submissions s
      join public.content_tasks t on t.id = s.task_id
      where s.id = review_events.submission_id
        and t.company_id = public.current_company_id()
    )
  );

-- posts
create policy "same company read posts" on public.posts for select
  using (
    exists (
      select 1 from public.content_tasks t
      where t.id = posts.task_id
        and t.company_id = public.current_company_id()
    )
  );

create policy "admins write posts" on public.posts for all
  using (
    public.is_admin()
    and exists (
      select 1 from public.content_tasks t
      where t.id = posts.task_id
        and t.company_id = public.current_company_id()
    )
  );

-- post_metrics
create policy "same company read metrics" on public.post_metrics for select
  using (
    exists (
      select 1
      from public.posts p
      join public.content_tasks t on t.id = p.task_id
      where p.id = post_metrics.post_id
        and t.company_id = public.current_company_id()
    )
  );

create policy "admins write metrics" on public.post_metrics for all
  using (
    public.is_admin()
    and exists (
      select 1
      from public.posts p
      join public.content_tasks t on t.id = p.task_id
      where p.id = post_metrics.post_id
        and t.company_id = public.current_company_id()
    )
  );

-- attribution_links
create policy "same company read attribution" on public.attribution_links for select
  using (company_id = public.current_company_id());

create policy "admins write attribution" on public.attribution_links for all
  using (company_id = public.current_company_id() and public.is_admin());

-- revenue_events
create policy "same company read revenue" on public.revenue_events for select
  using (company_id = public.current_company_id());

create policy "admins write revenue" on public.revenue_events for all
  using (company_id = public.current_company_id() and public.is_admin());

-- Storage: videos bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  false,
  524288000,
  array['video/mp4', 'video/quicktime']
)
on conflict (id) do nothing;

create policy "same company read videos" on storage.objects for select
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "creators upload videos" on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (
      public.is_admin()
      or public.current_role() = 'creator'
    )
  );

create policy "admins delete videos" on storage.objects for delete
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  );
