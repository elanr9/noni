-- 099: creator flag per membership, one switcher row per (company, role).
--
-- A profile can be a campaign manager in one company, a creator in another,
-- and both in a third. The dual flag moves from profiles.can_create (global)
-- to company_members.can_create (per company). profiles.can_create stays as
-- a mirror of the active membership so the client keeps reading it.
--   * can_create() reads the active membership.
--   * set_active_company mirrors role and can_create onto the profile.
--   * A membership change for the active company re-mirrors the profile.
--   * Inviting an existing manager as a creator (or a creator as a manager)
--     adds the second role instead of replacing the first.
--   * my_companies exposes can_create; company_status_summary emits one row
--     per (company, role) so a dual membership shows both lines.
--   * enable_creator_for_active_company() is the one way to turn on the flag.

alter table public.company_members
  add column if not exists can_create boolean not null default false;

update public.company_members m
  set can_create = true
  from public.profiles p
  where p.id = m.profile_id
    and p.can_create = true
    and m.role in ('campaign_manager', 'company_admin');

-- ---------------------------------------------------------------------------
-- 1. Helpers read the active membership
-- ---------------------------------------------------------------------------

create or replace function public.active_membership_can_create()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select m.can_create
  from public.company_members m
  join public.profiles p on p.id = m.profile_id
  where m.profile_id = auth.uid()
    and m.company_id = p.active_company_id
    and m.removed_at is null
$$;

create or replace function public.can_create()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.active_membership_role() = 'creator'
    or coalesce(
      public.active_membership_can_create(),
      (select can_create from public.profiles where id = auth.uid()),
      false
    )
$$;

-- ---------------------------------------------------------------------------
-- 2. Mirror role and can_create onto the profile
-- ---------------------------------------------------------------------------

create or replace function public.set_active_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.company_members;
  v_company public.companies;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_member
  from public.company_members m
  where m.profile_id = v_uid
    and m.company_id = p_company_id
    and m.removed_at is null;

  if v_member.company_id is null and not public.is_platform_admin() then
    raise exception 'not a member of this company' using errcode = '42501';
  end if;

  update public.profiles p
    set
      active_company_id = p_company_id,
      role = case
        when p.role = 'admin' then 'admin'
        when v_member.role is null then p.role
        else v_member.role
      end,
      can_create = coalesce(v_member.can_create, p.can_create)
    where p.id = v_uid;

  update public.company_members
    set last_active_at = now()
    where profile_id = v_uid and company_id = p_company_id;

  select * into v_company from public.companies where id = p_company_id;
  return v_company;
end;
$$;

create or replace function public.sync_profile_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.removed_at is not null then
    return new;
  end if;
  update public.profiles p
    set
      role = case when p.role = 'admin' then 'admin' else new.role end,
      can_create = new.can_create
    where p.id = new.profile_id
      and p.active_company_id = new.company_id
      and (
        p.can_create is distinct from new.can_create
        or (p.role <> 'admin' and p.role is distinct from new.role)
      );
  return new;
end;
$$;

drop trigger if exists company_members_sync_profile on public.company_members;
create trigger company_members_sync_profile
  after insert or update of role, can_create, removed_at on public.company_members
  for each row execute function public.sync_profile_from_membership();

-- Re-mirror every profile once so the flag matches its active membership.
update public.profiles p
  set can_create = m.can_create
  from public.company_members m
  where m.profile_id = p.id
    and m.company_id = p.active_company_id
    and m.removed_at is null
    and p.can_create is distinct from m.can_create;

-- ---------------------------------------------------------------------------
-- 3. Invites add a second role instead of replacing the first
-- ---------------------------------------------------------------------------

create or replace function public.apply_invite_membership(p_profile_id uuid, p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.company_invites;
  v_profile public.profiles;
  v_permissions jsonb;
begin
  select * into v_invite from public.company_invites where id = p_invite_id for update;
  if v_invite.id is null or v_invite.accepted_at is not null then
    return false;
  end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile.id is null then
    return false;
  end if;

  v_permissions := case
    when v_invite.role = 'company_admin' then public.full_member_permissions()
    when v_invite.role = 'campaign_manager'
      then public.default_member_permissions() || coalesce(v_invite.permissions, '{}'::jsonb)
    else public.default_member_permissions()
  end;

  insert into public.company_members (company_id, profile_id, role, permissions, can_create)
  values (v_invite.company_id, p_profile_id, v_invite.role, v_permissions, false)
  on conflict (company_id, profile_id) do update
    set
      role = case
        -- Removed members come back fresh in the invited role.
        when company_members.removed_at is not null then excluded.role
        -- A manager invited as a creator keeps managing and gains creating.
        when company_members.role in ('campaign_manager', 'company_admin')
          and excluded.role = 'creator' then company_members.role
        else excluded.role
      end,
      permissions = case
        when company_members.removed_at is not null then excluded.permissions
        when company_members.role in ('campaign_manager', 'company_admin')
          and excluded.role = 'creator' then company_members.permissions
        else excluded.permissions
      end,
      can_create = case
        when company_members.removed_at is not null then false
        when company_members.role in ('campaign_manager', 'company_admin')
          and excluded.role = 'creator' then true
        -- A creator invited as a manager keeps creating.
        when company_members.role = 'creator'
          and excluded.role in ('campaign_manager', 'company_admin') then true
        else company_members.can_create
      end,
      removed_at = null;

  if v_profile.active_company_id is null then
    update public.profiles
      set
        active_company_id = v_invite.company_id,
        role = case when v_profile.role = 'admin' then 'admin' else v_invite.role end,
        onboarded = case
          when v_invite.role in ('campaign_manager', 'company_admin') then true
          else v_profile.onboarded
        end
      where id = p_profile_id;
  end if;

  update public.company_invites set accepted_at = now() where id = v_invite.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Turning on the creator side for the active company
-- ---------------------------------------------------------------------------

create or replace function public.enable_creator_for_active_company()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.company_members m
    set can_create = true
    from public.profiles p
    where m.profile_id = v_uid
      and p.id = v_uid
      and m.company_id = p.active_company_id
      and m.removed_at is null
      and m.role in ('campaign_manager', 'company_admin');

  update public.profiles set can_create = true where id = v_uid;

  select * into v_profile from public.profiles where id = v_uid;
  return v_profile;
end;
$$;

grant execute on function public.enable_creator_for_active_company() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Roster view: can_create is the membership's flag
-- ---------------------------------------------------------------------------

create or replace view public.company_roster
with (security_invoker = true)
as
select
  m.company_id,
  m.role as member_role,
  m.permissions as member_permissions,
  m.created_at as joined_at,
  m.last_active_at,
  p.id,
  p.full_name,
  p.avatar_path,
  p.expo_push_token,
  p.onboarded,
  p.created_at,
  p.upload_post_profile,
  p.has_credential,
  p.has_scar_tissue,
  p.has_transformation,
  p.can_film_with_second_person,
  p.lives_the_identity,
  p.on_camera_comfortable,
  p.baseline_primary_signal,
  p.baseline_updated_at,
  p.credential_line,
  p.bio_facts,
  p.script_mode,
  p.available,
  p.birthday,
  p.phone,
  p.onboarding_answers,
  m.can_create,
  p.active_company_id,
  p.role as active_role
from public.company_members m
join public.profiles p on p.id = m.profile_id
where m.removed_at is null;

-- ---------------------------------------------------------------------------
-- 6. my_companies(): expose can_create
-- ---------------------------------------------------------------------------

drop function if exists public.my_companies();

create function public.my_companies()
returns table (
  company_id uuid,
  name text,
  slug text,
  logo_path text,
  role text,
  can_create boolean,
  permissions jsonb,
  is_active boolean,
  joined_at timestamptz,
  last_active_at timestamptz,
  attention jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.slug,
    c.logo_path,
    m.role,
    m.can_create,
    m.permissions,
    c.id = public.current_company_id(),
    m.created_at,
    m.last_active_at,
    public.company_attention(c.id)
  from public.company_members m
  join public.companies c on c.id = m.company_id
  where m.profile_id = auth.uid()
    and m.removed_at is null
  order by (c.id = public.current_company_id()) desc, c.name asc
$$;

grant execute on function public.my_companies() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. company_attention(): dual managers get their creator counts too
-- ---------------------------------------------------------------------------

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
      and a.scheduled_date < current_date;
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

-- ---------------------------------------------------------------------------
-- 8. company_status_summary(): one row per (company, role)
-- ---------------------------------------------------------------------------

drop function if exists public.company_status_summary();

create function public.company_status_summary()
returns table (
  company_id uuid,
  name text,
  logo_path text,
  role text,
  is_active boolean,
  waiting integer,
  line text,
  fix integer,
  unread integer,
  shoot integer,
  review integer,
  brief_due boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active uuid := public.current_company_id();
  m record;
  v_side text;
  v_today date;
  v_current_drop date;
  v_fix integer;
  v_unread integer;
  v_shoot integer;
  v_review integer;
  v_brief_due boolean;
  v_parts text[];
begin
  for m in
    select c.id, c.name, c.logo_path, cm.role, cm.can_create
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.profile_id = v_uid
      and cm.removed_at is null
    order by (c.id = v_active) desc, c.name asc
  loop
    v_unread := public.unread_inbox_count_for(m.id);
    v_today := public.company_local_date(m.id);

    foreach v_side in array (
      case
        when m.role = 'creator' then array['creator']
        when m.can_create then array['manager', 'creator']
        else array['manager']
      end
    )
    loop
      v_fix := 0;
      v_shoot := 0;
      v_review := 0;
      v_brief_due := false;
      v_parts := '{}';

      if v_side = 'creator' then
        select count(*) into v_fix
        from public.assignments a
        where a.company_id = m.id
          and a.creator_id = v_uid
          and a.status = 'changes_requested';

        select count(*) into v_shoot
        from public.assignments a
        where a.company_id = m.id
          and a.creator_id = v_uid
          and a.status = 'assigned'
          and a.scheduled_date = v_today;

        if v_fix > 0 then v_parts := v_parts || (v_fix || ' to fix'); end if;
        if v_unread > 0 then v_parts := v_parts || (v_unread || ' unread'); end if;
        if cardinality(v_parts) = 0 then v_parts := array['Caught up']; end if;
        if v_shoot > 0 then v_parts := v_parts || (v_shoot || ' to make'); end if;
      else
        select
          (select count(*) from public.assignments a
            where a.company_id = m.id and a.status = 'submitted')
          + (select count(*) from public.assignments a
            where a.company_id = m.id
              and a.music_marked_by_creator_at is not null
              and a.music_approved_at is null
              and a.status in ('approved', 'posted'))
          + (select count(*) from public.creator_accounts ca
            where ca.company_id = m.id and ca.status = 'pending')
        into v_review;

        select c.drop_date into v_current_drop
        from public.campaigns c
        where c.company_id = m.id
          and c.status = 'published'
          and c.drop_date is not null
          and c.drop_date <= v_today
        order by c.drop_date desc
        limit 1;

        if v_current_drop is not null
           and (v_current_drop + 6) - v_today <= 2
           and not exists (
             select 1 from public.campaigns c
             where c.company_id = m.id
               and c.drop_date > v_current_drop
           )
           and not exists (
             select 1 from public.weekly_batches b
             where b.company_id = m.id
               and b.week_start > v_current_drop
           ) then
          v_brief_due := true;
        end if;

        if v_review > 0 then v_parts := v_parts || (v_review || ' to review'); end if;
        if v_unread > 0 then v_parts := v_parts || (v_unread || ' unread'); end if;
        if v_brief_due then v_parts := v_parts || 'next week not planned'::text; end if;
        if cardinality(v_parts) = 0 then v_parts := array['Caught up']; end if;
      end if;

      company_id := m.id;
      name := m.name;
      logo_path := m.logo_path;
      role := case when v_side = 'creator' then 'creator' else m.role end;
      is_active := m.id = v_active;
      fix := v_fix;
      unread := v_unread;
      shoot := v_shoot;
      review := v_review;
      brief_due := v_brief_due;
      waiting := v_fix + v_unread + v_review + case when v_brief_due then 1 else 0 end;
      line := array_to_string(v_parts, ', ');
      return next;
    end loop;
  end loop;
end;
$$;

grant execute on function public.company_status_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. creator_earnings_by_company(): dual managers earn as creators too
-- ---------------------------------------------------------------------------

create or replace function public.creator_earnings_by_company()
returns table (
  company_id uuid,
  name text,
  logo_path text,
  earned_cents bigint,
  available_cents integer,
  pending_cents integer,
  is_total boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with per_company as (
    select
      c.id,
      c.name,
      c.logo_path,
      coalesce((
        select sum(l.amount_cents)
        from public.wallet_ledger l
        where l.company_id = c.id
          and l.creator_id = auth.uid()
          and l.kind in ('bounty_credit', 'streak_bonus', 'adjustment')
      ), 0)::bigint as earned_cents,
      coalesce(w.available_cents, 0) as available_cents,
      coalesce(w.pending_cents, 0) as pending_cents
    from public.company_members m
    join public.companies c on c.id = m.company_id
    left join public.creator_wallets w
      on w.company_id = c.id and w.creator_id = auth.uid()
    where m.profile_id = auth.uid()
      and m.removed_at is null
      and (m.role = 'creator' or m.can_create)
  )
  select id, name, logo_path, earned_cents, available_cents, pending_cents, false as is_total
  from per_company
  union all
  select
    null::uuid,
    'Total',
    null::text,
    coalesce(sum(earned_cents), 0)::bigint,
    coalesce(sum(available_cents), 0)::integer,
    coalesce(sum(pending_cents), 0)::integer,
    true
  from per_company
  order by 7 asc, 2 asc
$$;
