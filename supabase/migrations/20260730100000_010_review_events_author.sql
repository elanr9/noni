-- WP4.5: review_events.reviewer_id → author_id; creators may insert comments.

alter table public.review_events
  rename column reviewer_id to author_id;

alter table public.review_events
  rename constraint review_events_reviewer_id_fkey to review_events_author_id_fkey;

-- Creators insert action=comment on submissions they own (admins keep all via existing policy).
create policy "creators comment own submissions" on public.review_events
  for insert
  with check (
    author_id = auth.uid()
    and action = 'comment'
    and exists (
      select 1
      from public.submissions s
      join public.content_tasks t on t.id = s.task_id
      where s.id = review_events.submission_id
        and s.creator_id = auth.uid()
        and t.company_id = public.current_company_id()
        and t.assigned_to = auth.uid()
    )
  );
