-- 139: multi-company fixes.
--
-- One person can create and manage in several companies at once. This closes
-- the places that still treated a person as belonging to one company:
--   1. message_reads: one read marker per (company, thread, reader). The key
--      was (creator_id, profile_id), so reading a thread in one company moved
--      the marker for every company, and unread_inbox_count_for read it
--      without a company filter.
--   2. has_permission(): a removed membership no longer grants its flags.
--   3. reassign_active_company_on_removal(): mirrors can_create as well as
--      role when a member loses their active company.
--   4. Removal clears the removed creator's untouched future assignments, and
--      company_attention() stops counting removed creators as "behind".
--   5. Creator and manager setup completion is recorded per company inside
--      profiles.onboarding_answers. Existing flags are carried over so nobody
--      who is set up is asked again.
--
-- Safe to run more than once. Nothing here rewrites or deletes existing rows:
-- the only statements that touch stored data add read markers, add keys to
-- onboarding_answers, or correct profiles.can_create to match the membership
-- it mirrors.

-- ---------------------------------------------------------------------------
-- 1. message_reads: per company
-- ---------------------------------------------------------------------------

-- company_id has been not null since the table was made (079); this only
-- guards a database where that was loosened by hand, since a primary key
-- column cannot hold nulls.
delete from public.message_reads where company_id is null;

do $$
declare
  v_pk name;
  v_has_company boolean;
begin
  select c.conname,
         exists (
           select 1
           from unnest(c.conkey) as k(attnum)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
           where a.attname = 'company_id'
         )
    into v_pk, v_has_company
  from pg_constraint c
  where c.conrelid = 'public.message_reads'::regclass
    and c.contype = 'p';

  if v_pk is null then
    alter table public.message_reads
      add constraint message_reads_pkey primary key (company_id, creator_id, profile_id);
  elsif not v_has_company then
    -- The old key (creator_id, profile_id) is a subset of the new one, so
    -- every existing row is already unique under it.
    execute format('alter table public.message_reads drop constraint %I', v_pk);
    alter table public.message_reads
      add constraint message_reads_pkey primary key (company_id, creator_id, profile_id);
  end if;
end;
$$;

-- The old marker counted for every company the reader shares with the
-- creator. Copy it to those other companies so no thread that showed as read
-- turns unread. Adds rows only; an existing marker is never changed.
insert into public.message_reads (company_id, creator_id, profile_id, last_read_at)
select distinct on (reader.company_id, r.creator_id, r.profile_id)
       reader.company_id, r.creator_id, r.profile_id, r.last_read_at
from public.message_reads r
join public.company_members reader
  on reader.profile_id = r.profile_id
 and reader.removed_at is null
 and reader.company_id <> r.company_id
join public.company_members subject
  on subject.profile_id = r.creator_id
 and subject.company_id = reader.company_id
order by reader.company_id, r.creator_id, r.profile_id, r.last_read_at desc
on conflict (company_id, creator_id, profile_id) do nothing;

create or replace function public.unread_inbox_count_for(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (
      select count(*)
      from public.messages m
      where m.company_id = p_company_id
        and m.author_id <> auth.uid()
        and (
          m.creator_id = auth.uid()
          or (m.author_id = m.creator_id and public.is_manager_of(p_company_id))
        )
        and m.created_at > coalesce(
          (select r.last_read_at from public.message_reads r
            where r.company_id = p_company_id
              and r.creator_id = m.creator_id
              and r.profile_id = auth.uid()),
          'epoch'::timestamptz)
    )
    +
    (
      select count(*)
      from public.manager_messages mm
      join public.manager_chats c on c.id = mm.chat_id
      where c.company_id = p_company_id
        and mm.author_id <> auth.uid()
        and public.can_access_manager_chat(c.id)
        and mm.created_at > coalesce(
          (select r.last_read_at from public.manager_chat_reads r
            where r.chat_id = mm.chat_id and r.profile_id = auth.uid()),
          'epoch'::timestamptz)
    )
  )::integer
$$;

-- Same grants as 128 left it with.
revoke execute on function public.unread_inbox_count_for(uuid) from public, anon;
grant execute on function public.unread_inbox_count_for(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. has_permission(): removed memberships grant nothing
-- ---------------------------------------------------------------------------

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or public.is_company_admin()
    or coalesce(
      (
        select (cm.permissions ->> p_key)::boolean
        from public.company_members cm
        where cm.profile_id = auth.uid()
          and cm.company_id = public.current_company_id()
          and cm.removed_at is null
      ),
      false
    )
$$;

-- ---------------------------------------------------------------------------
-- 3. Removal from the active company: mirror can_create with the role
-- ---------------------------------------------------------------------------

create or replace function public.reassign_active_company_on_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.company_members;
begin
  if new.removed_at is null then
    return new;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.active_company_id = new.company_id
  ) then
    select * into v_next
    from public.company_members m
    where m.profile_id = new.profile_id
      and m.removed_at is null
      and m.company_id <> new.company_id
    order by m.last_active_at desc nulls last, m.created_at asc
    limit 1;

    update public.profiles p
      set
        active_company_id = v_next.company_id,
        role = case
          when p.role = 'admin' then 'admin'
          when v_next.company_id is null then p.role
          else v_next.role
        end,
        -- With no company left the flag must not outlive the membership:
        -- can_create() falls back to it when there is no active membership.
        can_create = case
          when p.role = 'admin' then p.can_create
          else coalesce(v_next.can_create, false)
        end
      where p.id = new.profile_id;
  end if;

  return new;
end;
$$;

-- Re-mirror once (same statement as 099): the flag follows the active
-- membership for anyone left stale by an earlier removal.
update public.profiles p
  set can_create = m.can_create
  from public.company_members m
  where m.profile_id = p.id
    and m.company_id = p.active_company_id
    and m.removed_at is null
    and p.role is distinct from 'admin'
    and p.can_create is distinct from m.can_create;

-- ---------------------------------------------------------------------------
-- 4. Removal: clear the creator's untouched future assignments
-- ---------------------------------------------------------------------------

-- Deliberately narrow. An assignment goes only when a manager made it, it is
-- scheduled for today or later, it is still 'assigned', and nothing at all
-- hangs off it: no submission, post, recording draft, project, segment edit,
-- message, link or ledger row. Anything a creator has touched, anything
-- overdue, and every post the creator started themselves stays as history.
create or replace function public.clear_unstarted_assignments_on_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.removed_at is null or old.removed_at is not null then
    return new;
  end if;

  -- Removing a member must never fail because of this clean-up.
  begin
    delete from public.assignments a
    where a.company_id = new.company_id
      and a.creator_id = new.profile_id
      and a.status = 'assigned'
      and a.scheduled_date >= current_date
      and a.submission_id is null
      and a.post_url is null
      and a.bounty_credited_at is null
      and a.publish_at is null
      and not exists (
        select 1 from public.briefs b
        where b.id = a.brief_id and b.created_by = a.creator_id
      )
      and not exists (select 1 from public.submissions s where s.assignment_id = a.id)
      and not exists (select 1 from public.posts p where p.assignment_id = a.id)
      and not exists (select 1 from public.attribution_links l where l.assignment_id = a.id)
      and not exists (select 1 from public.recording_drafts d where d.assignment_id = a.id)
      and not exists (select 1 from public.creator_projects cp where cp.assignment_id = a.id)
      and not exists (select 1 from public.assignment_segment_edits e where e.assignment_id = a.id)
      and not exists (select 1 from public.messages msg where msg.assignment_id = a.id)
      and not exists (select 1 from public.manager_messages mm where mm.assignment_id = a.id)
      and not exists (select 1 from public.company_credit_ledger cl where cl.assignment_id = a.id);
  exception when others then
    raise warning 'clear_unstarted_assignments_on_removal: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.clear_unstarted_assignments_on_removal() from public, anon, authenticated;

drop trigger if exists company_members_clear_unstarted on public.company_members;
create trigger company_members_clear_unstarted
  after update of removed_at on public.company_members
  for each row execute function public.clear_unstarted_assignments_on_removal();

-- "Creators behind" counts people still in the company. Overdue work a
-- removed creator left is kept (above) but is no longer anyone's to chase.
create or replace function public.company_attention(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.member_role(p_company_id);
  v_can_create boolean := coalesce((
    select m.can_create from public.company_members m
    where m.company_id = p_company_id and m.profile_id = v_uid and m.removed_at is null
  ), false);
  v_manager boolean := public.is_manager_of(p_company_id);
  v_unread integer := public.unread_inbox_count_for(p_company_id);
  v_due integer := 0;
  v_changes integer := 0;
  v_review integer := 0;
  v_accounts integer := 0;
  v_behind integer := 0;
  v_total integer;
begin
  if v_role = 'creator' or v_can_create then
    select count(*) into v_due
    from public.assignments a
    where a.company_id = p_company_id
      and a.creator_id = v_uid
      and a.status in ('assigned', 'recorded')
      and a.scheduled_date <= current_date;

    select count(*) into v_changes
    from public.assignments a
    where a.company_id = p_company_id
      and a.creator_id = v_uid
      and a.status = 'changes_requested';
  end if;

  if v_manager then
    select count(*) into v_review
    from public.assignments a
    where a.company_id = p_company_id
      and a.status = 'submitted';

    select count(*) into v_accounts
    from public.creator_accounts ca
    where ca.company_id = p_company_id
      and ca.status = 'pending';

    select count(distinct a.creator_id) into v_behind
    from public.assignments a
    where a.company_id = p_company_id
      and a.status in ('assigned', 'recorded')
      and a.scheduled_date < current_date
      and exists (
        select 1 from public.company_members cm
        where cm.company_id = a.company_id
          and cm.profile_id = a.creator_id
          and cm.removed_at is null
      );
  end if;

  v_total := v_due + v_changes + v_review + v_accounts + v_behind + v_unread;

  return jsonb_build_object(
    'due', v_due,
    'changes_requested', v_changes,
    'to_review', v_review,
    'accounts_pending', v_accounts,
    'creators_behind', v_behind,
    'unread_messages', v_unread,
    'total', v_total,
    'caught_up', v_total = 0
  );
end;
$$;

revoke execute on function public.company_attention(uuid) from public, anon;
grant execute on function public.company_attention(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Setup completion per company (profiles.onboarding_answers)
-- ---------------------------------------------------------------------------

-- The app now reads setup_complete_companies / manager_setup_complete_companies
-- / creator_invited_companies, each a { "<company id>": true } map. The old
-- person-wide flags are left in place and carried into the maps here. Each
-- update only adds keys, and only where the key is missing.

-- Creator setup: the company the creator is in now, plus every company where
-- their accounts are already approved.
update public.profiles p
set onboarding_answers = jsonb_set(
  p.onboarding_answers,
  '{setup_complete_companies}',
  coalesce(p.onboarding_answers -> 'setup_complete_companies', '{}'::jsonb) || s.done
)
from (
  select x.profile_id, jsonb_object_agg(x.company_id::text, true) as done
  from (
    select p2.id as profile_id, p2.active_company_id as company_id
    from public.profiles p2
    where p2.active_company_id is not null
    union
    select ca.creator_id, ca.company_id
    from public.creator_accounts ca
    where ca.status = 'approved'
  ) x
  group by x.profile_id
) s
where s.profile_id = p.id
  and jsonb_typeof(p.onboarding_answers) = 'object'
  and p.onboarding_answers ->> 'setup_complete' = 'true'
  and not (coalesce(p.onboarding_answers -> 'setup_complete_companies', '{}'::jsonb) @> s.done);

-- Manager setup: every company the person manages today.
update public.profiles p
set onboarding_answers = jsonb_set(
  p.onboarding_answers,
  '{manager_setup_complete_companies}',
  coalesce(p.onboarding_answers -> 'manager_setup_complete_companies', '{}'::jsonb) || s.done
)
from (
  select m.profile_id, jsonb_object_agg(m.company_id::text, true) as done
  from public.company_members m
  where m.removed_at is null
    and m.role in ('campaign_manager', 'company_admin')
  group by m.profile_id
) s
where s.profile_id = p.id
  and jsonb_typeof(p.onboarding_answers) = 'object'
  and p.onboarding_answers ->> 'manager_setup_complete' = 'true'
  and not (coalesce(p.onboarding_answers -> 'manager_setup_complete_companies', '{}'::jsonb) @> s.done);

-- "This manager already sent a creator invite": same companies.
update public.profiles p
set onboarding_answers = jsonb_set(
  p.onboarding_answers,
  '{creator_invited_companies}',
  coalesce(p.onboarding_answers -> 'creator_invited_companies', '{}'::jsonb) || s.done
)
from (
  select m.profile_id, jsonb_object_agg(m.company_id::text, true) as done
  from public.company_members m
  where m.removed_at is null
    and m.role in ('campaign_manager', 'company_admin')
  group by m.profile_id
) s
where s.profile_id = p.id
  and jsonb_typeof(p.onboarding_answers) = 'object'
  and p.onboarding_answers ->> 'creator_invited' = 'true'
  and not (coalesce(p.onboarding_answers -> 'creator_invited_companies', '{}'::jsonb) @> s.done);
