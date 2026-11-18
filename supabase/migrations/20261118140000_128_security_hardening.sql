-- Security hardening from the 2026-11-18 backend audit.
-- 1. Two SECURITY DEFINER readers returned any company's data by UUID.
-- 2. Privileged definer functions were executable by signed-out callers.
-- 3. account-verification let any creator read every other creator's proof
--    in the company and write the company template; the template could not
--    be re-saved (no UPDATE policy).
-- 4. source_posts (Company Brain inspiration) was only in the web repo's
--    migrations and never reached this database.
-- 5. leads (web waitlist / business sign-ups), service role only.
-- 6. Mutable search_path on plain functions; a duplicate index.

-- 1. Company checks on the definer readers. Edge functions call them with the
--    service role (auth.role() = 'service_role'); members call them for their
--    own company only.
create or replace function public.brief_snapshot_json(p_brief_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'brief',
      to_jsonb(b)
        - 'company_id' - 'created_at' - 'created_by' - 'archived_at'
        - 'review_result' - 'reviewed_at' - 'example_transcript',
    'post_type_key', pt.key,
    'segments',
      coalesce(
        (
          select jsonb_agg(
            (to_jsonb(s) - 'id' - 'company_id' - 'brief_id' - 'created_at')
            order by s.slot_index
          )
          from public.brief_segments s
          where s.brief_id = b.id
        ),
        '[]'::jsonb
      )
  )
  from public.briefs b
  left join public.post_types pt on pt.id = b.post_type_id
  where b.id = p_brief_id
    and (auth.role() = 'service_role' or public.is_member_of(b.company_id));
$$;

create or replace function public.segment_for_assignment(p_segment_id uuid, p_assignment_id uuid)
returns public.brief_segments
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_segment public.brief_segments%rowtype;
  v_edit public.assignment_segment_edits%rowtype;
begin
  select * into v_segment from public.brief_segments where id = p_segment_id;
  if not found then
    raise exception 'segment not found';
  end if;
  if not (auth.role() = 'service_role' or public.is_member_of(v_segment.company_id)) then
    raise exception 'segment not found';
  end if;
  select * into v_edit from public.assignment_segment_edits
    where assignment_id = p_assignment_id and segment_id = p_segment_id
      and company_id = v_segment.company_id;
  if found then
    if v_edit.overlay_style is not null then
      v_segment.overlay_style := v_edit.overlay_style;
      v_segment.overlay_text := v_edit.overlay_text;
      v_segment.text_y := v_edit.text_y;
      v_segment.show_on_screen := coalesce(v_edit.show_on_screen, v_segment.show_on_screen);
    end if;
    v_segment.screenshot_x := coalesce(v_edit.screenshot_x, v_segment.screenshot_x);
    v_segment.screenshot_y := coalesce(v_edit.screenshot_y, v_segment.screenshot_y);
    v_segment.screenshot_width := coalesce(v_edit.screenshot_width, v_segment.screenshot_width);
  end if;
  return v_segment;
end;
$$;

-- 2. Signed-out callers lose the privileged functions. RLS helper functions
--    (current_company_id, is_member_of, has_permission, ...) keep their grants
--    because policies evaluate them for every role.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'assignment_publish_at', 'brief_snapshot_json', 'company_attention', 'company_local_date',
        'company_status_summary', 'copy_brief_into', 'creator_earnings_by_company',
        'enable_creator_for_active_company', 'label_trend', 'mark_all_notifications_read',
        'mark_notification_read', 'my_companies', 'notifications_feed', 'profile_in_company',
        'publish_campaign_assignments', 'schedule_assignment_publish', 'seed_company_post_types',
        'set_active_company', 'shares_company_with', 'snapshot_ai_brief', 'switch_active_company',
        'unread_inbox_count', 'unread_inbox_count_for', 'segment_for_assignment'
      )
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname = 'seed_company_post_types' then
      -- Writes into any company with no caller check: server only.
      execute format('revoke execute on function %s from authenticated', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    end if;
  end loop;
end;
$$;

-- 3. account-verification: <company>/<creator id>/... belongs to that creator;
--    <company>/template/... is the managers' account template.
drop policy if exists "same company read account verification" on storage.objects;
drop policy if exists "creators upload account verification" on storage.objects;
drop policy if exists "account verification read" on storage.objects;
drop policy if exists "account verification insert" on storage.objects;
drop policy if exists "account verification update" on storage.objects;

create policy "account verification read" on storage.objects for select to authenticated
  using (
    bucket_id = 'account-verification'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[2] = 'template'
      or public.is_manager_of(public.current_company_id())
    )
  );

create policy "account verification insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'account-verification'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or ((storage.foldername(name))[2] = 'template' and public.is_manager_of(public.current_company_id()))
    )
  );

create policy "account verification update" on storage.objects for update to authenticated
  using (
    bucket_id = 'account-verification'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or ((storage.foldername(name))[2] = 'template' and public.is_manager_of(public.current_company_id()))
    )
  )
  with check (
    bucket_id = 'account-verification'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or ((storage.foldername(name))[2] = 'template' and public.is_manager_of(public.current_company_id()))
    )
  );

-- 4. source_posts, ported from noni-web with a membership-based read policy.
create table if not exists public.source_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  platform text not null,
  handle text not null,
  external_id text not null,
  url text not null,
  caption text not null default '',
  thumbnail_url text not null default '',
  views integer not null default 0,
  likes integer not null default 0,
  shares integer not null default 0,
  comments integer not null default 0,
  score integer not null default 0,
  hook text not null default '',
  why text not null default '',
  format text not null default 'Video',
  fetched_at timestamptz not null default now(),
  unique (company_id, platform, external_id)
);
create index if not exists source_posts_company_handle_idx on public.source_posts (company_id, platform, handle);
comment on table public.source_posts is
  'Best posts from inspiration accounts. Feeds company-specific brief generation with what already works on TikTok and Instagram.';
alter table public.source_posts enable row level security;
drop policy if exists source_posts_company_select on public.source_posts;
create policy source_posts_company_select on public.source_posts for select to authenticated
  using (public.is_member_of(company_id));
drop policy if exists source_posts_manager_write on public.source_posts;
create policy source_posts_manager_write on public.source_posts for all to authenticated
  using (public.is_manager_of(company_id))
  with check (public.is_manager_of(company_id));

-- 5. leads: written by the web route with the service role; no client access.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('waitlist', 'business', 'enterprise', 'testflight')),
  name text not null,
  email text not null,
  phone text,
  company text,
  website text,
  message text,
  source text,
  user_agent text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (lower(email));
alter table public.leads enable row level security;

-- 6. Fixed search_path on the remaining plain functions; drop the duplicate index.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not p.prosecdef
      and p.proname in (
        'streak_bonus_cents', 'sync_brief_segments', 'claim_post_milestone', 'campaign_notify_at',
        'full_member_permissions', 'default_member_permissions', 'library_our_posts',
        'stamp_stripe_connected_at', 'slot_publish_time', 'chat_media_chat_id'
      )
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'company_billing_company_id_key')
     and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'company_billing_pkey') then
    if exists (select 1 from pg_constraint where conname = 'company_billing_company_id_key') then
      alter table public.company_billing drop constraint company_billing_company_id_key;
    else
      drop index public.company_billing_company_id_key;
    end if;
  end if;
end;
$$;
