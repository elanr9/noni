-- 126: per-user notification preferences and real account deletion.
--
-- notification_prefs: { "<category>": false } turns a push category off.
-- A missing key means on. Categories (see supabase/functions/notify):
--   submissions  posts, songs and accounts waiting for review (managers)
--   reviews      approvals, change requests and comments on your posts (creators)
--   messages     direct messages and channels
--   live         posts going live
--   streaks      streak progress and bonuses (creators)
-- The in-app notification feed keeps every row; prefs only gate the push.

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- Atomic single-key update for the signed-in user. The existing
-- "users update own profile" policy would also allow a plain update, but a
-- merge here means two quick toggles never overwrite each other.
create or replace function public.set_notification_pref(p_key text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefs jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_key not in ('submissions', 'reviews', 'messages', 'live', 'streaks') then
    raise exception 'unknown notification category %', p_key;
  end if;
  update public.profiles
     set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) || jsonb_build_object(p_key, p_on)
   where id = auth.uid()
  returning notification_prefs into v_prefs;
  return coalesce(v_prefs, '{}'::jsonb);
end;
$$;

revoke all on function public.set_notification_pref(text, boolean) from public, anon;
grant execute on function public.set_notification_pref(text, boolean) to authenticated;

-- Account deletion, called by the delete-account edge function (service role).
-- Scrubs the profile, ends every membership, and reports whether the auth
-- user can be hard deleted. Hard delete cascades the profile, which only
-- works when no NOT NULL, non-cascading foreign key still points at it (for
-- example review history the company keeps). In that case nothing else is
-- touched and the edge function soft deletes the auth user instead, so the
-- sign-in is gone and the scrubbed profile only anchors company history.
create or replace function public.prepare_account_deletion(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  fk record;
  v_blocked boolean := false;
  v_found boolean;
begin
  update public.company_members
     set removed_at = coalesce(removed_at, now())
   where profile_id = p_user;

  update public.profiles
     set full_name = 'Deleted user',
         phone = null,
         avatar_path = null,
         expo_push_token = null,
         birthday = null,
         bio_facts = '{}'::jsonb,
         onboarding_answers = '{}'::jsonb,
         notification_prefs = '{}'::jsonb,
         credential_line = null,
         available = false
   where id = p_user;

  -- Single-column FKs in public that point at profiles(id) or auth.users(id)
  -- and do not cascade or set null on their own.
  for fk in
    select c.conrelid::regclass as tbl,
           a.attname as col,
           a.attnotnull as notnull
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_namespace n on n.oid = (select relnamespace from pg_class where oid = c.conrelid)
     where c.contype = 'f'
       and array_length(c.conkey, 1) = 1
       and n.nspname = 'public'
       and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
       and c.confdeltype in ('a', 'r')
  loop
    if fk.notnull then
      execute format('select exists (select 1 from %s where %I = $1)', fk.tbl, fk.col)
        into v_found using p_user;
      if v_found then
        v_blocked := true;
      end if;
    end if;
  end loop;

  if v_blocked then
    return false;
  end if;

  for fk in
    select c.conrelid::regclass as tbl,
           a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_namespace n on n.oid = (select relnamespace from pg_class where oid = c.conrelid)
     where c.contype = 'f'
       and array_length(c.conkey, 1) = 1
       and n.nspname = 'public'
       and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
       and c.confdeltype in ('a', 'r')
       and not a.attnotnull
  loop
    execute format('update %s set %I = null where %I = $1', fk.tbl, fk.col, fk.col) using p_user;
  end loop;

  return true;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
