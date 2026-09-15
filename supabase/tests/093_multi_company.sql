-- Acceptance for 093_multi_company_active_context and 094_status_summary_brief_due. Runs inside one
-- transaction and rolls back, so it is safe against any database that has
-- the migration applied. Every check raises on failure; success prints
-- one row: 'all 093 checks passed'.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/093_multi_company.sql
-- or paste the whole file into the Management API query endpoint.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, slug) values
  ('00000000-0000-4000-8000-00000000000a', 'Test A 093', 'test-a-093'),
  ('00000000-0000-4000-8000-00000000000b', 'Test B 093', 'test-b-093'),
  ('00000000-0000-4000-8000-00000000000c', 'Test C 093', 'test-c-093'),
  ('00000000-0000-4000-8000-00000000000d', 'Test D 093', 'test-d-093');

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'creator-093@noni.test', now(), now()),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-093@noni.test', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'solo-093@noni.test', now(), now());

-- Creator: member of A (via profile insert trigger) and B (explicit).
insert into public.profiles (id, active_company_id, role, full_name, onboarded)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'creator', 'Test Creator', true);
insert into public.company_members (company_id, profile_id, role, permissions)
  values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000c1', 'creator', public.default_member_permissions());

-- Manager: member of A only.
insert into public.profiles (id, active_company_id, role, full_name, onboarded)
  values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', 'campaign_manager', 'Test Manager', true);

-- Single-company creator in D (regression: behaves as before).
insert into public.profiles (id, active_company_id, role, full_name, onboarded)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000d', 'creator', 'Solo Creator', true);

insert into public.briefs (id, company_id, title) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000a', 'Brief A'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', 'Brief B');

-- A: 1 to fix, 1 to shoot today. B: 2 to fix.
insert into public.assignments (company_id, brief_id, creator_id, scheduled_date, status) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', public.company_local_date('00000000-0000-4000-8000-00000000000a') - 1, 'changes_requested'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', public.company_local_date('00000000-0000-4000-8000-00000000000a'), 'assigned'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c1', public.company_local_date('00000000-0000-4000-8000-00000000000b') - 1, 'changes_requested'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c1', public.company_local_date('00000000-0000-4000-8000-00000000000b') - 2, 'changes_requested');

-- B: one unread message to the creator.
insert into public.messages (company_id, creator_id, author_id, body)
  values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', 'hello from B');

insert into public.wallet_ledger (company_id, creator_id, kind, amount_cents) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000c1', 'bounty_credit', 1000),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000c1', 'bounty_credit', 500),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000c1', 'payout_paid', -500);

insert into public.notifications (company_id, profile_id, event, title, body, deep_link) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000c1', 'changes_requested', 'Changes requested', 'Brief A', 'noni://creator/00000000-0000-4000-8000-00000000000a/home'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000c1', 'message', 'Manager', 'hello from B', 'noni://creator/00000000-0000-4000-8000-00000000000b/chat');

-- A: current week started 5 days ago (ends tomorrow), nothing planned after it.
insert into public.campaigns (id, company_id, name, status, drop_date)
  values ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-00000000000a', 'Week now', 'published', public.company_local_date('00000000-0000-4000-8000-00000000000a') - 5);

-- Pending invite into C for the creator (second company join path).
insert into public.company_invites (company_id, email, role)
  values ('00000000-0000-4000-8000-00000000000c', 'creator-093@noni.test', 'creator');

-- ---------------------------------------------------------------------------
-- As the creator
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';

do $$
declare
  v_company public.companies;
  v_count integer;
  v_rows integer;
begin
  -- Active A: only A rows.
  v_company := public.set_active_company('00000000-0000-4000-8000-00000000000a');
  if v_company.slug <> 'test-a-093' then raise exception 'set_active_company should return company A'; end if;
  select count(*), count(*) filter (where company_id <> '00000000-0000-4000-8000-00000000000a') into v_count, v_rows from public.assignments;
  if v_count <> 2 or v_rows <> 0 then raise exception 'expected 2 A assignments and no others, got % (foreign %)', v_count, v_rows; end if;
  if public.is_campaign_manager() then raise exception 'creator must not be campaign manager in A'; end if;
  if not public.can_create() then raise exception 'creator must can_create() in A'; end if;

  -- Summary is independent of the active company.
  select count(*) into v_count from public.company_status_summary();
  if v_count <> 2 then raise exception 'expected 2 summary rows, got %', v_count; end if;
  perform 1 from public.company_status_summary() s
    where s.company_id = '00000000-0000-4000-8000-00000000000a'
      and s.fix = 1 and s.shoot = 1 and s.unread = 0 and s.waiting = 1 and s.is_active
      and s.line = '1 to fix, 1 to make';
  if not found then raise exception 'summary A wrong: %', (select row_to_json(s) from public.company_status_summary() s where s.company_id = '00000000-0000-4000-8000-00000000000a'); end if;
  perform 1 from public.company_status_summary() s
    where s.company_id = '00000000-0000-4000-8000-00000000000b'
      and s.fix = 2 and s.shoot = 0 and s.unread = 1 and s.waiting = 3 and not s.is_active
      and s.line = '2 to fix, 1 unread';
  if not found then raise exception 'summary B wrong: %', (select row_to_json(s) from public.company_status_summary() s where s.company_id = '00000000-0000-4000-8000-00000000000b'); end if;

  -- Active B: only B rows.
  v_company := public.set_active_company('00000000-0000-4000-8000-00000000000b');
  select count(*), count(*) filter (where company_id <> '00000000-0000-4000-8000-00000000000b') into v_count, v_rows from public.assignments;
  if v_count <> 2 or v_rows <> 0 then raise exception 'expected 2 B assignments and no others, got % (foreign %)', v_count, v_rows; end if;
  perform 1 from public.company_status_summary() s
    where s.company_id = '00000000-0000-4000-8000-00000000000b' and s.is_active and s.fix = 2 and s.unread = 1;
  if not found then raise exception 'summary B wrong after switch'; end if;
  perform 1 from public.company_status_summary() s
    where s.company_id = '00000000-0000-4000-8000-00000000000a' and not s.is_active and s.fix = 1 and s.shoot = 1;
  if not found then raise exception 'summary A wrong after switch'; end if;

  -- my_companies: active first.
  perform 1 from (select * from public.my_companies() limit 1) f where f.company_id = '00000000-0000-4000-8000-00000000000b' and f.is_active;
  if not found then raise exception 'my_companies should list the active company first'; end if;

  -- Non-member switch raises.
  begin
    perform public.set_active_company('00000000-0000-4000-8000-00000000000d');
    raise exception 'set_active_company for a non-member must raise';
  exception when insufficient_privilege then null;
  end;

  -- Direct column update to a non-member company raises too.
  begin
    update public.profiles set active_company_id = '00000000-0000-4000-8000-00000000000d' where id = auth.uid();
    raise exception 'direct active_company_id update to a non-member company must raise';
  exception when insufficient_privilege then null;
  end;

  -- Earnings across companies plus total.
  perform 1 from public.creator_earnings_by_company() e where e.company_id = '00000000-0000-4000-8000-00000000000a' and e.earned_cents = 1000;
  if not found then raise exception 'earnings A wrong'; end if;
  perform 1 from public.creator_earnings_by_company() e where e.company_id = '00000000-0000-4000-8000-00000000000b' and e.earned_cents = 500;
  if not found then raise exception 'earnings B wrong'; end if;
  perform 1 from public.creator_earnings_by_company() e where e.is_total and e.earned_cents = 1500;
  if not found then raise exception 'earnings total wrong'; end if;

  -- Notifications feed across companies, then mark one read.
  select count(*) into v_count from public.notifications_feed(50);
  if v_count <> 2 then raise exception 'expected 2 notifications, got %', v_count; end if;
  perform 1 from public.notifications_feed(50) n where n.company_name = 'Test A 093' and n.deep_link like 'noni://creator/%';
  if not found then raise exception 'feed should join company name'; end if;
  perform public.mark_notification_read((select n.id from public.notifications_feed(50) n where n.company_id = '00000000-0000-4000-8000-00000000000a'));
  select count(*) into v_count from public.notifications_feed(50) n where n.read_at is not null;
  if v_count <> 1 then raise exception 'expected 1 read notification, got %', v_count; end if;

  -- Realtime heartbeat visible for every member company.
  select count(*) into v_count from public.company_activity
    where company_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
  if v_count <> 2 then raise exception 'company_activity should be readable for both companies, got %', v_count; end if;

  -- Joining a second company via a pending invite leaves the active one alone.
  perform public.claim_pending_invite();
  if public.current_company_id() <> '00000000-0000-4000-8000-00000000000b' then raise exception 'claiming an invite must not change the active company'; end if;
  select count(*) into v_count from public.my_companies();
  if v_count <> 3 then raise exception 'expected 3 memberships after invite, got %', v_count; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- As the manager (member of A only)
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}';

do $$
declare
  v_count integer;
begin
  if not public.is_campaign_manager() then raise exception 'manager must be campaign manager in A'; end if;
  if public.is_company_admin() then raise exception 'manager must not be company admin'; end if;
  if public."current_role"() <> 'campaign_manager' then raise exception 'current_role should come from membership'; end if;
  select count(*) into v_count from public.assignments;
  if v_count <> 2 then raise exception 'manager should see the 2 A assignments, got %', v_count; end if;
  begin
    perform public.set_active_company('00000000-0000-4000-8000-00000000000b');
    raise exception 'manager is not a member of B';
  exception when insufficient_privilege then null;
  end;
  perform 1 from public.company_status_summary() s
    where s.company_id = '00000000-0000-4000-8000-00000000000a' and s.role = 'campaign_manager'
      and s.review = 0 and s.brief_due and s.waiting = 1 and s.line = 'next week not planned';
  if not found then raise exception 'manager summary wrong (brief due): %', (select row_to_json(s) from public.company_status_summary() s); end if;
end;
$$;

-- Planning next week (a later weekly_batches or campaigns row) clears brief_due.
reset role;
insert into public.weekly_batches (company_id, week_start, status)
  values ('00000000-0000-4000-8000-00000000000a', public.company_local_date('00000000-0000-4000-8000-00000000000a') + 2, 'in_review');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}';

do $$
begin
  perform 1 from public.company_status_summary() s
    where s.company_id = '00000000-0000-4000-8000-00000000000a' and not s.brief_due and s.waiting = 0 and s.line = 'Caught up';
  if not found then raise exception 'manager summary wrong (planned): %', (select row_to_json(s) from public.company_status_summary() s); end if;
end;
$$;

-- Creators never get brief_due.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
do $$
begin
  perform 1 from public.company_status_summary() s where s.brief_due;
  if found then raise exception 'creator rows must not set brief_due'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Single-company regression
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}';

do $$
declare
  v_count integer;
begin
  if public.current_company_id() <> '00000000-0000-4000-8000-00000000000d' then raise exception 'solo creator active company wrong'; end if;
  if not public.can_create() or public.is_campaign_manager() then raise exception 'solo creator role helpers wrong'; end if;
  select count(*) into v_count from public.my_companies();
  if v_count <> 1 then raise exception 'solo creator should have 1 membership, got %', v_count; end if;
  perform 1 from public.company_status_summary() s where s.company_id = '00000000-0000-4000-8000-00000000000d' and s.line = 'Caught up' and s.waiting = 0;
  if not found then raise exception 'solo creator summary wrong'; end if;
end;
$$;

reset role;
select 'all 093/094 checks passed' as result;

rollback;
