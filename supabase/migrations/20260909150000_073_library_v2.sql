-- Library v2: a row remembers the last post made from it, and Our posts
-- surface the lazily created our_post library row (thumbnail, use count).

alter table public.library_items
  add column if not exists last_brief_id uuid references public.briefs(id) on delete set null;

drop function if exists public.library_our_posts(int, uuid, uuid, text, text, int, int);

create function public.library_our_posts(
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
  metrics_fetched_at timestamptz,
  thumbnail_url text,
  used_count int,
  library_item_id uuid
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
    pm.fetched_at,
    li.thumbnail_url,
    coalesce(li.used_count, 0),
    li.id
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
  left join lateral (
    select li.id, li.thumbnail_url, li.used_count
    from public.library_items li
    where li.source = 'our_post'
      and li.post_id = p.id
      and li.company_id = public.current_company_id()
    order by li.created_at asc
    limit 1
  ) li on true
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
