-- Creator-started posts (migration 123) need two things a creator cannot do
-- through RLS: name the post (the title lives on the brief row, which only
-- managers may write) and throw away an unfinished one (creators may update
-- but never delete assignments). Both are narrow, owner-only functions.

-- Rename: the creator who started the post sets its title before sending.
create or replace function public.rename_creator_post(
  p_assignment_id uuid,
  p_title text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
  v_title text := left(btrim(coalesce(p_title, '')), 120);
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if v_title = '' then
    raise exception 'a post needs a name';
  end if;

  select a.brief_id into v_brief_id
  from public.assignments a
  join public.briefs b on b.id = a.brief_id
  where a.id = p_assignment_id
    and a.creator_id = auth.uid()
    and b.created_by = auth.uid()
    and a.status in ('assigned', 'recorded', 'changes_requested');
  if v_brief_id is null then
    raise exception 'post not found';
  end if;

  update public.briefs set title = v_title where id = v_brief_id;
end;
$$;

revoke all on function public.rename_creator_post(uuid, text) from public;
grant execute on function public.rename_creator_post(uuid, text) to authenticated;

-- Discard: an unfinished post the creator started and never sent goes away
-- with its brief row. Drafts and projects cascade from the assignment.
create or replace function public.discard_creator_post(
  p_assignment_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select a.brief_id into v_brief_id
  from public.assignments a
  join public.briefs b on b.id = a.brief_id
  where a.id = p_assignment_id
    and a.creator_id = auth.uid()
    and b.created_by = auth.uid()
    and a.status in ('assigned', 'recorded')
    and a.submission_id is null
    and not exists (select 1 from public.submissions s where s.assignment_id = a.id);
  if v_brief_id is null then
    raise exception 'only an unsent post you started can be discarded';
  end if;

  delete from public.assignments where id = p_assignment_id;
  delete from public.briefs b
  where b.id = v_brief_id
    and not exists (select 1 from public.assignments a where a.brief_id = b.id);
end;
$$;

revoke all on function public.discard_creator_post(uuid) from public;
grant execute on function public.discard_creator_post(uuid) to authenticated;
