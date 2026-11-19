-- Removing a company from platform ops did nothing: `companies` has no delete
-- policy, so the signed-in delete matched zero rows without an error, and
-- about forty tables point at `companies` with a plain foreign key that would
-- have refused the delete anyway.
--
-- Every company-scoped foreign key now cascades, a profile's active company
-- is cleared rather than blocking, and ops_delete_company clears the few
-- tables that hang off company rows without a company_id of their own before
-- deleting the company. Only the service role may call it; the web server
-- action checks for a platform admin first.

do $$
declare
  fk record;
begin
  for fk in
    select c.conname, c.conrelid::regclass as tbl, c.conrelid,
           pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.companies'::regclass
      and c.confdeltype = 'a'
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    execute format(
      'alter table %s add constraint %I %s on delete %s',
      fk.tbl,
      fk.conname,
      fk.def,
      case when fk.conrelid = 'public.profiles'::regclass then 'set null' else 'cascade' end
    );
  end loop;
end $$;

create or replace function public.ops_delete_company(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  -- assignments and submissions point at each other.
  update public.assignments set submission_id = null
  where company_id = p_company_id and submission_id is not null;

  create temporary table _doomed_submissions on commit drop as
    select s.id from public.submissions s
    where s.assignment_id in (select id from public.assignments where company_id = p_company_id)
       or s.task_id in (select id from public.content_tasks where company_id = p_company_id);

  create temporary table _doomed_posts on commit drop as
    select p.id from public.posts p
    where p.assignment_id in (select id from public.assignments where company_id = p_company_id)
       or p.task_id in (select id from public.content_tasks where company_id = p_company_id)
       or p.submission_id in (select id from _doomed_submissions);

  delete from public.post_metrics where post_id in (select id from _doomed_posts);
  delete from public.wallet_ledger where company_id = p_company_id;
  delete from public.library_items where company_id = p_company_id;
  delete from public.review_events
  where submission_id in (select id from _doomed_submissions)
     or segment_id in (select id from public.submission_segments where company_id = p_company_id);
  delete from public.posts where id in (select id from _doomed_posts);
  delete from public.submissions where id in (select id from _doomed_submissions);

  delete from public.companies where id = p_company_id;
  v_found := found;

  drop table _doomed_posts;
  drop table _doomed_submissions;
  return v_found;
end $$;

revoke all on function public.ops_delete_company(uuid) from public, anon, authenticated;
grant execute on function public.ops_delete_company(uuid) to service_role;
