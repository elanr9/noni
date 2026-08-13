-- Invite-aware signup: campaign manager invites no longer need the web accept
-- step. When an invited email signs up (App Store Google sign-in), the signup
-- trigger creates their profile as an onboarded campaign manager of the
-- inviting company and marks the invite accepted. Everyone else keeps the
-- existing creator bootstrap.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_invite_id uuid;
  v_invite_company uuid;
begin
  select i.id, i.company_id into v_invite_id, v_invite_company
  from public.company_invites i
  where lower(i.email) = lower(coalesce(new.email, ''))
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_invite_id is not null then
    insert into public.profiles (id, company_id, role, full_name, onboarded)
    values (
      new.id,
      v_invite_company,
      'campaign_manager',
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      true
    )
    on conflict (id) do nothing;

    update public.company_invites
      set accepted_at = now()
      where id = v_invite_id;

    return new;
  end if;

  select id into v_company from public.companies order by created_at asc limit 1;
  if v_company is null then
    return new;
  end if;
  insert into public.profiles (id, company_id, role, full_name, onboarded)
  values (
    new.id,
    v_company,
    'creator',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
