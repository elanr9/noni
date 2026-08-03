-- Admin Create: explicit ordering for the campaign grid. Backfill follows
-- the created_at order the reads used before this column existed.

alter table public.campaign_briefs add column position int;

update public.campaign_briefs cb
set position = sub.rn - 1
from (
  select campaign_id, brief_id,
    row_number() over (
      partition by campaign_id order by created_at, brief_id
    ) as rn
  from public.campaign_briefs
) sub
where cb.campaign_id = sub.campaign_id
  and cb.brief_id = sub.brief_id;
