-- Dual-role: admins may also create on the same profile (can_create).
-- role stays 'admin' for RLS admin gates; can_create unlocks creator write paths.

alter table public.profiles
  add column if not exists can_create boolean not null default false;

create or replace function public.can_create()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'creator' or can_create = true)
  )
$$;

-- content_tasks: creators (and dual admins) update their assigned tasks
drop policy if exists "creators update assigned tasks" on public.content_tasks;
create policy "creators update assigned tasks" on public.content_tasks for update
  using (
    company_id = public.current_company_id()
    and assigned_to = auth.uid()
    and public.can_create()
  )
  with check (
    company_id = public.current_company_id()
    and assigned_to = auth.uid()
  );

-- assignments: own-row updates for creators / dual admins
drop policy if exists "creators update own assignments" on public.assignments;
create policy "creators update own assignments" on public.assignments for update
  using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
    and public.can_create()
  )
  with check (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

-- video uploads: allow dual admins (is_admin already covered; keep can_create explicit)
drop policy if exists "creators upload videos" on storage.objects;
create policy "creators upload videos" on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (
      public.is_admin()
      or public.can_create()
    )
  );
