-- Every library screenshot and recording carries a name ("Highlight video")
-- so a manager placing it on a post knows which file it is without opening it.

alter table public.media_library add column title text;

create policy "media library managers update" on public.media_library
  for update using (
    company_id = public.current_company_id() and public.is_campaign_manager()
  )
  with check (
    company_id = public.current_company_id() and public.is_campaign_manager()
  );
