-- MVP v2 milestone 3: submissions attach to assignments.
-- Published campaigns create assignments with no content_task, so the
-- recording flow needs a direct submission -> assignment link. Legacy
-- task-linked submissions keep working; every policy here is additive.

alter table public.submissions
  alter column task_id drop not null;

alter table public.submissions
  add column assignment_id uuid references public.assignments;

alter table public.submissions
  add constraint submissions_target_check
  check (task_id is not null or assignment_id is not null);

create index submissions_assignment on public.submissions (assignment_id);

-- Read: anyone in the assignment's company.
create policy "same company read assignment submissions" on public.submissions
  for select using (
    exists (
      select 1 from public.assignments a
      where a.id = submissions.assignment_id
        and a.company_id = public.current_company_id()
    )
  );

-- Insert: the creator who owns the assignment.
create policy "creators insert assignment submissions" on public.submissions
  for insert with check (
    creator_id = auth.uid()
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.creator_id = auth.uid()
        and a.company_id = public.current_company_id()
    )
  );

-- Admins manage assignment submissions in their company.
create policy "admins write assignment submissions" on public.submissions
  for all using (
    public.is_admin()
    and exists (
      select 1 from public.assignments a
      where a.id = submissions.assignment_id
        and a.company_id = public.current_company_id()
    )
  );

-- Review thread on assignment submissions.
create policy "same company read assignment reviews" on public.review_events
  for select using (
    exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = review_events.submission_id
        and a.company_id = public.current_company_id()
    )
  );

create policy "creators comment own assignment submissions" on public.review_events
  for insert with check (
    author_id = auth.uid()
    and action = 'comment'
    and exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = review_events.submission_id
        and s.creator_id = auth.uid()
        and a.creator_id = auth.uid()
        and a.company_id = public.current_company_id()
    )
  );

create policy "admins write assignment reviews" on public.review_events
  for all using (
    public.is_admin()
    and exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = review_events.submission_id
        and a.company_id = public.current_company_id()
    )
  );
