-- Agent 5 (Library) reads.
--
-- 1. RLS FIX with blast radius beyond the Library: the posts and post_metrics
--    SELECT policies from migration 001 only scope through content_tasks
--    (task_id). Posts written by the assignment fan-out (migration 021,
--    task_id null) were invisible to every client query — including the
--    existing analytics screen. Policies are recreated to accept either path.
--    Write policies get the same treatment so admin clients can touch
--    assignment-path rows.
-- 2. library_our_posts: server-side join + latest-metrics ranking for the
--    Library "Our posts" chip. ~20 creators at 30 posts a week is a search
--    problem; PostgREST cannot order by a lateral latest-snapshot metric, so
--    filter, search, sort and paging happen here. SECURITY INVOKER: RLS
--    applies, and company scope is also enforced explicitly.

-- ---------------------------------------------------------------------------
-- posts: read/write through content_tasks OR assignments.

drop policy "same company read posts" on public.posts;
create policy "same company read posts" on public.posts for select
  using (
    exists (
      select 1 from public.content_tasks t
      where t.id = posts.task_id
        and t.company_id = public.current_company_id()
    )
    or exists (
      select 1 from public.assignments a
      where a.id = posts.assignment_id
        and a.company_id = public.current_company_id()
    )
  );

drop policy "admins write posts" on public.posts;
create policy "admins write posts" on public.posts for all
  using (
    public.is_admin()
    and (
      exists (
        select 1 from public.content_tasks t
        where t.id = posts.task_id
          and t.company_id = public.current_company_id()
      )
      or exists (
        select 1 from public.assignments a
        where a.id = posts.assignment_id
          and a.company_id = public.current_company_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- post_metrics: same two-path fix.

drop policy "same company read metrics" on public.post_metrics;
create policy "same company read metrics" on public.post_metrics for select
  using (
    exists (
      select 1
      from public.posts p
      left join public.content_tasks t on t.id = p.task_id
      left join public.assignments a on a.id = p.assignment_id
      where p.id = post_metrics.post_id
        and coalesce(t.company_id, a.company_id) = public.current_company_id()
    )
  );

drop policy "admins write metrics" on public.post_metrics;
create policy "admins write metrics" on public.post_metrics for all
  using (
    public.is_admin()
    and exists (
      select 1
      from public.posts p
      left join public.content_tasks t on t.id = p.task_id
      left join public.assignments a on a.id = p.assignment_id
      where p.id = post_metrics.post_id
        and coalesce(t.company_id, a.company_id) = public.current_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- library_our_posts: one row per live posts row (failed excluded), with the
-- latest metrics snapshot, brief context and creator name. Covers both the
-- assignment path (brief-backed) and the legacy content_tasks path (post_type
-- null there). p_days null = all time. p_sort: 'top' (views desc, default) or
-- 'recent' (posted_at desc). p_search matches brief title, hook, caption and
-- search phrase, or the legacy task title and hook.

create or replace function public.library_our_posts(
  p_days int default 60,
  p_creator_id uuid default null,
  p_post_type_id uuid default null,
  p_search text default null,
  p_sort text default 'top',
  p_limit int default 50,
  p_offset int default 0
) returns table (
  post_id uuid,
  platform text,
  post_url text,
  posted_at timestamptz,
  creator_id uuid,
  creator_name text,
  brief_id uuid,
  title text,
  hook text,
  post_type_id uuid,
  post_type_key text,
  post_type_label text,
  family text,
  views int,
  likes int,
  saves int,
  comments int,
  metrics_fetched_at timestamptz
)
language sql
stable
as $$
  select
    p.id,
    p.platform,
    p.post_url,
    p.posted_at,
    coalesce(a.creator_id, t.assigned_to),
    pr.full_name,
    b.id,
    coalesce(b.title, t.title),
    coalesce(b.hook, t.hook),
    pt.id,
    pt.key,
    pt.label,
    pt.family,
    pm.views,
    pm.likes,
    pm.saves,
    pm.comments,
    pm.fetched_at
  from public.posts p
  left join public.assignments a on a.id = p.assignment_id
  left join public.content_tasks t on t.id = p.task_id
  left join public.briefs b on b.id = a.brief_id
  left join public.post_types pt on pt.id = b.post_type_id
  left join public.profiles pr on pr.id = coalesce(a.creator_id, t.assigned_to)
  left join lateral (
    select m.views, m.likes, m.saves, m.comments, m.fetched_at
    from public.post_metrics m
    where m.post_id = p.id
    order by m.fetched_at desc nulls last
    limit 1
  ) pm on true
  where coalesce(a.company_id, t.company_id) = public.current_company_id()
    and coalesce(p.status, 'posted') <> 'failed'
    and (p_days is null or p.posted_at >= now() - make_interval(days => p_days))
    and (p_creator_id is null or coalesce(a.creator_id, t.assigned_to) = p_creator_id)
    and (p_post_type_id is null or b.post_type_id = p_post_type_id)
    and (
      p_search is null or p_search = ''
      or coalesce(b.title, t.title) ilike '%' || p_search || '%'
      or coalesce(b.hook, t.hook) ilike '%' || p_search || '%'
      or b.caption ilike '%' || p_search || '%'
      or b.search_phrase ilike '%' || p_search || '%'
    )
  order by
    case when p_sort = 'recent' then null else coalesce(pm.views, 0) end desc nulls last,
    p.posted_at desc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
