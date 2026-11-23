-- 156: website sign ups could not make their company.
-- Companies that sign up on the website are approved at once, before the
-- onboarding chat has asked who runs their campaigns, so runs_campaigns is
-- missing and `v_runs = 'me'` was null, breaking the not null
-- companies.self_is_manager (every website sign up landed on an error page).
-- Until the onboarding chat says otherwise, the person signing up runs it.

CREATE OR REPLACE FUNCTION public.approve_application(p_id uuid, p_note text DEFAULT NULL::text)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_app public.applications;
  v_a jsonb;
  v_company_id uuid;
  v_profile public.profiles;
  v_name text;
  v_runs text;
begin
  if not public.is_platform_admin() and auth.uid() is not null then
    raise exception 'platform admin only' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_id for update;
  if v_app.id is null then
    raise exception 'application not found';
  end if;
  if v_app.status = 'approved' then
    return v_app;
  end if;
  if v_app.status = 'draft' then
    raise exception 'application is not finished yet';
  end if;

  v_a := v_app.answers;
  select * into v_profile from public.profiles where id = v_app.user_id;

  if v_app.kind = 'company' then
    v_name := coalesce(nullif(trim(v_a ->> 'company_name'), ''), 'New company');
    v_runs := v_a ->> 'runs_campaigns';
    insert into public.companies (
      name, slug, website, intake, admin_role, manager_count, self_is_manager, onboarded_at
    ) values (
      v_name,
      public.unique_company_slug(v_name),
      nullif(trim(v_a ->> 'website'), ''),
      jsonb_strip_nulls(jsonb_build_object(
        'goal', v_a ->> 'goal',
        'platforms', v_a -> 'platforms',
        'creators_wanted', v_a ->> 'creators_wanted',
        'monthly_budget', v_a ->> 'monthly_budget',
        'launch', v_a ->> 'launch',
        'campaigns_run_by', v_runs,
        'source', 'application'
      )),
      v_a ->> 'role',
      case when v_runs = 'noni' then 0 else 1 end,
      coalesce(v_runs, 'me') = 'me',
      now()
    )
    returning id into v_company_id;

    if v_profile.id is null then
      -- profiles_ensure_membership adds the company_admin membership.
      insert into public.profiles (id, active_company_id, role, full_name, onboarded)
      values (v_app.user_id, v_company_id, 'company_admin', nullif(trim(v_app.full_name), ''), true);
    else
      insert into public.company_members (company_id, profile_id, role, permissions)
      values (v_company_id, v_app.user_id, 'company_admin', public.full_member_permissions())
      on conflict (company_id, profile_id) do update
        set role = 'company_admin', removed_at = null, permissions = public.full_member_permissions();
      if v_profile.role <> 'admin' then
        update public.profiles
          set active_company_id = v_company_id, role = 'company_admin', onboarded = true
          where id = v_app.user_id;
      end if;
    end if;
  else
    if v_profile.id is null then
      insert into public.profiles (id, active_company_id, role, full_name, onboarded)
      values (v_app.user_id, null, 'creator', nullif(trim(v_app.full_name), ''), true);
    end if;
  end if;

  update public.applications
    set status = 'approved',
        decided_at = now(),
        decided_by = auth.uid(),
        decision_note = p_note,
        company_id = v_company_id,
        updated_at = now()
    where id = p_id
    returning * into v_app;
  return v_app;
end;
$function$;
