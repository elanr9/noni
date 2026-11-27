-- 171: reminders and push settings for creators on a campaign.
--
-- Campaign creators start their own posts, so notify-reminders now reminds
-- them against the campaign's posts a day (daily_posts, daily_posts_evening),
-- about a post that was sent back (fix_post) and about an agreement still
-- unsigned (sign_agreement). Two new push categories, reminders and earnings,
-- can be turned off in Settings.

alter table public.creator_reminders drop constraint if exists creator_reminders_kind_check;
alter table public.creator_reminders
  add constraint creator_reminders_kind_check
  check (kind in (
    'due_today',
    'overdue',
    'creator_behind',
    'account_warmup',
    'slot_0',
    'slot_1',
    'slot_2',
    'afternoon_nudge',
    'posts_ready',
    'daily_posts',
    'daily_posts_evening',
    'fix_post',
    'sign_agreement'
  ));

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
  if p_key not in ('submissions', 'reviews', 'messages', 'live', 'streaks', 'briefs', 'reminders', 'earnings') then
    raise exception 'unknown notification category %', p_key;
  end if;
  update public.profiles
     set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) || jsonb_build_object(p_key, p_on)
   where id = auth.uid()
  returning notification_prefs into v_prefs;
  return coalesce(v_prefs, '{}'::jsonb);
end;
$$;

-- The declined push says declined (the owner's word) and drops the reassurance line.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'decide_marketplace_application';
  if v_def is not null and position('passed this time' in v_def) > 0 then
    v_def := replace(v_def, 'passed this time', 'declined');
    v_def := replace(v_def, 'Plenty more campaigns are open in the marketplace.', 'See other campaigns in Market.');
    execute v_def;
  end if;
end;
$$;
