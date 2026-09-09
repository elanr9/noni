-- Creators can drag the burned-in subtitle block up or down in the editor.
-- The chosen position lives on the brief and feeds the Creatomate render.

alter table public.briefs
  add column subtitles_y double precision not null default 0.78;

comment on column public.briefs.subtitles_y is
  'Centre of the two line subtitle block as a fraction of frame height (0 = top, 1 = bottom).';

create or replace function public.creator_place_subtitles(
  p_brief_id uuid,
  p_y double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief public.briefs%rowtype;
begin
  select * into v_brief from public.briefs where id = p_brief_id;
  if not found then
    raise exception 'brief not found';
  end if;
  if v_brief.company_id <> public.current_company_id() then
    raise exception 'forbidden';
  end if;
  if not exists (
    select 1 from public.assignments a
    where a.brief_id = p_brief_id
      and a.creator_id = auth.uid()
      and a.status in ('assigned', 'recorded', 'changes_requested')
  ) then
    raise exception 'not assigned to this brief';
  end if;

  update public.briefs
    set subtitles_y = least(0.92, greatest(0.10, p_y))
    where id = p_brief_id;
end;
$$;

revoke all on function public.creator_place_subtitles(uuid, double precision) from public;
grant execute on function public.creator_place_subtitles(uuid, double precision) to authenticated;
