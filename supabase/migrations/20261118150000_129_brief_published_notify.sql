-- 129: tell creators when their team publishes a new brief.
--
-- AFTER INSERT on library_briefs (an upsert that updates an existing brief
-- does not fire it, so edits and offline retries never re-notify). Only
-- Guided and Outline briefs count, and never the Outline twin a guided brief
-- is saved with (from_id set), so one save is one notification.
--
-- 1. One notifications row per creator member of the company (role creator
--    or can_create), minus the author, for the in-app feed. Event
--    'brief_published', data carries brief_id, type and kind so a tap opens
--    the brief (lib/notification-routing.ts).
-- 2. The push itself goes out from the notify-brief edge function, called
--    through pg_net with the cron secret like the other server pushes. It
--    reads profiles.notification_prefs and skips anyone with "briefs": false.
--    A failed call never blocks the save.
-- 3. set_notification_pref accepts the new "briefs" category.

create or replace function public.notify_brief_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
  v_link text;
  v_data jsonb;
  v_count integer;
begin
  if new.kind not in ('Guided', 'Outline') then
    return new;
  end if;
  if new.kind = 'Outline' and new.from_id is not null then
    return new;
  end if;

  v_title := 'New brief';
  v_body := case
    when new.kind = 'Outline' then 'New outline: ' || new.title
    else 'New ' || new.type || ' post: ' || new.title
  end;
  -- Valid deep link grammar (noni://creator/<company>/briefs/<id>); clients
  -- that do not know the briefs screen fall back to the creator home.
  v_link := 'noni://creator/' || new.company_id || '/briefs/' || new.id;
  v_data := jsonb_build_object(
    'event', 'brief_published',
    'company_id', new.company_id,
    'deep_link', v_link,
    'brief_id', new.id,
    'type', new.type,
    'kind', new.kind
  );

  insert into public.notifications (company_id, profile_id, event, title, body, deep_link, data)
  select new.company_id, m.profile_id, 'brief_published', v_title, v_body, v_link, v_data
  from public.company_members m
  where m.company_id = new.company_id
    and m.removed_at is null
    and (m.role = 'creator' or coalesce(m.can_create, false))
    and m.profile_id is distinct from new.created_by;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    begin
      perform net.http_post(
        url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/notify-brief',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := jsonb_build_object('brief_id', new.id),
        timeout_milliseconds := 10000
      );
    exception when others then
      raise warning 'notify-brief call failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_brief_published() from public, anon, authenticated;

drop trigger if exists library_briefs_notify_published on public.library_briefs;
create trigger library_briefs_notify_published
  after insert on public.library_briefs
  for each row execute function public.notify_brief_published();

-- New push category: "briefs" (new briefs from your team, creators).
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
  if p_key not in ('submissions', 'reviews', 'messages', 'live', 'streaks', 'briefs') then
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
