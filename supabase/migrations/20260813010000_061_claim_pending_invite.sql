-- Attach a pending email invite on later Google sign-ins.
-- handle_new_user only runs on auth.users INSERT, so an invited person who
-- already has an auth user (opened the app before the invite, or signed in
-- during the old unattached-creator trigger) would otherwise stay stuck.
-- Also matches Google emails stored on user metadata when new.email is blank.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_email text;
begin
  v_email := lower(coalesce(
    new.email,
    new.raw_user_meta_data ->> 'email',
    ''
  ));

  select i.id, i.company_id, i.role, i.permissions into v_invite
  from public.company_invites i
  where lower(i.email) = v_email
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_invite.id is null then
    return new;
  end if;

  insert into public.profiles (id, company_id, role, full_name, onboarded)
  values (
    new.id,
    v_invite.company_id,
    v_invite.role,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    false
  )
  on conflict (id) do nothing;

  if v_invite.role in ('company_admin', 'campaign_manager') then
    insert into public.company_members (company_id, profile_id, permissions)
    values (
      v_invite.company_id,
      new.id,
      case
        when v_invite.role = 'company_admin' then public.full_member_permissions()
        else public.default_member_permissions() || coalesce(v_invite.permissions, '{}'::jsonb)
      end
    )
    on conflict (company_id, profile_id) do nothing;
  end if;

  update public.company_invites
    set accepted_at = now()
    where id = v_invite.id;

  return new;
end;
$$;

create or replace function public.claim_pending_invite()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite record;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(coalesce(u.email, u.raw_user_meta_data ->> 'email', ''))
    into v_email
    from auth.users u
    where u.id = v_uid;

  select * into v_profile from public.profiles where id = v_uid;

  select i.id, i.company_id, i.role, i.permissions into v_invite
  from public.company_invites i
  where lower(i.email) = v_email
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_invite.id is null then
    return v_profile;
  end if;

  -- Already in a different company: do not steal the account.
  if v_profile.company_id is not null
     and v_profile.company_id is distinct from v_invite.company_id then
    return v_profile;
  end if;

  if v_profile.id is null then
    insert into public.profiles (id, company_id, role, full_name, onboarded)
    values (v_uid, v_invite.company_id, v_invite.role, null, false)
    returning * into v_profile;
  else
    update public.profiles
      set
        company_id = v_invite.company_id,
        role = v_invite.role,
        onboarded = case
          when v_profile.role is not distinct from v_invite.role
               and v_profile.company_id is not distinct from v_invite.company_id
            then v_profile.onboarded
          else false
        end
      where id = v_uid
      returning * into v_profile;
  end if;

  if v_invite.role in ('company_admin', 'campaign_manager') then
    insert into public.company_members (company_id, profile_id, permissions)
    values (
      v_invite.company_id,
      v_uid,
      case
        when v_invite.role = 'company_admin' then public.full_member_permissions()
        else public.default_member_permissions() || coalesce(v_invite.permissions, '{}'::jsonb)
      end
    )
    on conflict (company_id, profile_id) do nothing;
  end if;

  update public.company_invites
    set accepted_at = now()
    where id = v_invite.id;

  return v_profile;
end;
$$;

grant execute on function public.claim_pending_invite() to authenticated;
revoke all on function public.claim_pending_invite() from public;
