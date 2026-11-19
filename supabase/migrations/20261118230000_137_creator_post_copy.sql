-- A creator-started post carries its library brief's caption, hashtags and
-- search phrase. start_creator_post (migration 123) made the briefs row with
-- a title and format only, so at publish vary-copy rewrote the title and the
-- caption the manager approved never reached the post. The briefs row now
-- holds the brief's caption with its hashtags appended, which is the
-- "original" vary-copy rewrites per creator.

-- The copy a post inherits from a library brief. An outline twin has no
-- caption of its own and falls back to the guided brief it was saved with.
-- The search phrase is only carried when the caption already contains it:
-- vary-copy requires the phrase word for word in every variant.
create or replace function public.library_brief_post_copy(p_library_brief_id text, p_company_id uuid)
returns table (caption text, hashtags text[], search_phrase text)
language sql
stable
security definer
set search_path = public
as $$
  with src as (
    select
      lb.title,
      coalesce(nullif(btrim(lb.caption), ''), nullif(btrim(p.caption), '')) as caption,
      case when cardinality(lb.tags) > 0 then lb.tags else coalesce(p.tags, '{}') end as tags,
      coalesce(nullif(btrim(lb.g ->> 'phrase'), ''), nullif(btrim(p.g ->> 'phrase'), '')) as phrase
    from public.library_briefs lb
    left join public.library_briefs p on p.id = lb.from_id and p.company_id = lb.company_id
    where lb.id = p_library_brief_id and lb.company_id = p_company_id
  ),
  tagged as (
    select
      src.*,
      coalesce(
        (
          select array_agg(t.tag order by t.ord)
          from (
            select '#' || ltrim(regexp_replace(raw, '\s+', '', 'g'), '#') as tag, ord
            from unnest(src.tags) with ordinality as u (raw, ord)
          ) t
          where length(t.tag) > 1
        ),
        '{}'
      ) as clean_tags
    from src
  )
  select
    case
      when tagged.caption is null and cardinality(tagged.clean_tags) = 0 then null
      else btrim(
        coalesce(tagged.caption, tagged.title) || ' ' ||
        coalesce(
          (
            select string_agg(tag, ' ' order by ord)
            from unnest(tagged.clean_tags) with ordinality as u (tag, ord)
            where position(lower(tag) in lower(coalesce(tagged.caption, ''))) = 0
          ),
          ''
        )
      )
    end,
    tagged.clean_tags,
    case
      when tagged.caption is not null and tagged.phrase is not null
        and position(lower(tagged.phrase) in lower(tagged.caption)) > 0
      then tagged.phrase
      else null
    end
  from tagged;
$$;

revoke all on function public.library_brief_post_copy(text, uuid) from public;

create or replace function public.start_creator_post(
  p_company_id uuid,
  p_title text,
  p_format text,
  p_library_brief_id text default null
) returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
  v_row public.assignments;
  v_caption text;
  v_hashtags text[];
  v_phrase text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not public.is_member_of(p_company_id) then
    raise exception 'not a member of this company';
  end if;
  if p_format not in ('video', 'photo_carousel') then
    raise exception 'format must be video or photo_carousel';
  end if;

  if p_library_brief_id is not null then
    select c.caption, c.hashtags, c.search_phrase
      into v_caption, v_hashtags, v_phrase
    from public.library_brief_post_copy(p_library_brief_id, p_company_id) c;
  end if;

  insert into public.briefs (company_id, created_by, title, format, caption, hashtags, search_phrase)
  values (
    p_company_id,
    auth.uid(),
    coalesce(nullif(trim(p_title), ''), 'New post'),
    p_format,
    v_caption,
    coalesce(v_hashtags, '{}'),
    v_phrase
  )
  returning id into v_brief_id;

  insert into public.assignments (company_id, brief_id, library_brief_id, creator_id, scheduled_date, status)
  values (p_company_id, v_brief_id, p_library_brief_id, auth.uid(), current_date, 'assigned')
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.start_creator_post(uuid, text, text, text) from public;
grant execute on function public.start_creator_post(uuid, text, text, text) to authenticated;

-- Posts already started from a library brief and not yet given a caption:
-- their briefs row gets the same copy, so they publish from it too.
update public.briefs b
set caption = c.caption,
    hashtags = c.hashtags,
    search_phrase = c.search_phrase
from public.assignments a
cross join lateral public.library_brief_post_copy(a.library_brief_id, a.company_id) c
where a.brief_id = b.id
  and a.library_brief_id is not null
  and a.caption is null
  and a.status in ('assigned', 'recorded', 'submitted', 'changes_requested', 'approved')
  and b.created_by = a.creator_id
  and b.caption is null
  and c.caption is not null;
