-- Null defaults so the generated client types allow omitting args when
-- clearing a label.
drop function if exists public.label_trend(uuid, text, text);

create or replace function public.label_trend(
  p_trend_id uuid,
  p_label text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_label is not null and p_label not in ('keep', 'kill') then
    raise exception 'invalid label';
  end if;
  update public.trend_items
  set label = p_label,
      label_reason = p_reason,
      labeled_by = auth.uid(),
      is_golden = case when public.is_admin() and p_label is not null then true
                       when p_label is null then false
                       else is_golden end
  where id = p_trend_id
    and company_id = public.current_company_id();
  if not found then
    raise exception 'trend not found';
  end if;
end;
$$;
