-- 170: a drawn signature, and a push when something happens in the marketplace.
--
-- The creator scribbles their signature in the app or on the web; it is kept
-- as SVG path data next to the typed legal name. marketplace_notify used to
-- only write the in-app notification, so an accepted creator heard nothing
-- until they opened the app; it now also sends the push.

alter table public.marketplace_applications
  add column if not exists signature_svg text;

comment on column public.marketplace_applications.signature_svg is
  'The drawn signature as SVG path data (M/L commands) in a 320 by 120 box.';

drop function if exists public.sign_creator_agreement(uuid, text);

create or replace function public.sign_creator_agreement(p_application_id uuid, p_signed_name text, p_signature text default null)
returns public.marketplace_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.marketplace_applications;
  v_listing public.marketplace_listings;
  v_profile public.profiles;
  v_cp public.creator_profiles;
  v_name text := regexp_replace(trim(coalesce(p_signed_name, '')), '\s+', ' ', 'g');
  v_start date;
  v_invited boolean;
  v_signature text := nullif(trim(coalesce(p_signature, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_app from public.marketplace_applications
    where id = p_application_id and creator_id = v_uid for update;
  if v_app.id is null then
    raise exception 'agreement not found';
  end if;
  if v_app.status = 'accepted' and v_app.signed_at is not null then
    return v_app;
  end if;
  if v_app.status not in ('offered', 'invited') then
    raise exception 'There is nothing to sign yet';
  end if;
  v_invited := v_app.status = 'invited';
  select * into v_listing from public.marketplace_listings where id = v_app.listing_id;
  select * into v_profile from public.profiles where id = v_uid;
  select * into v_cp from public.creator_profiles where user_id = v_uid;

  if v_cp.birth_year is null then
    raise exception 'Add your age to your profile before you sign';
  end if;
  if extract(year from now())::int - v_cp.birth_year < greatest(18, v_listing.min_age) then
    raise exception 'This campaign is for creators % and older', greatest(18, v_listing.min_age);
  end if;
  if length(v_name) < 3 or position(' ' in v_name) = 0 then
    raise exception 'Type your full legal name to sign';
  end if;
  -- The drawn signature: SVG path data in a 320 by 120 box, nothing else.
  if v_signature is not null and (length(v_signature) < 12 or length(v_signature) > 24000 or v_signature !~ '^[ML0-9 .]+$') then
    raise exception 'Draw your signature again';
  end if;
  if v_app.contract_body is null or length(trim(v_app.contract_body)) < 40 then
    v_app.contract_body := public.creator_contract(v_listing, v_uid);
    v_app.contract_title := v_listing.contract_title;
    v_app.contract_version := v_listing.contract_version;
  end if;

  v_start := greatest(coalesce(v_app.start_date, current_date + v_listing.start_days), current_date);
  perform public.marketplace_join(v_app.company_id, v_uid);
  update public.marketplace_applications
    set status = 'accepted',
        contract_title = v_app.contract_title, contract_body = v_app.contract_body,
        contract_version = v_app.contract_version,
        contract_sha256 = encode(sha256(convert_to(v_app.contract_body, 'UTF8')), 'hex'),
        signed_name = v_name, signed_at = now(), signature_svg = v_signature,
        decided_by = coalesce(decided_by, invited_by), decided_at = coalesce(decided_at, now()),
        start_date = v_start, updated_at = now()
    where id = v_app.id returning * into v_app;

  perform public.marketplace_notify(
    v_app.company_id, public.marketplace_manager_ids(v_app.company_id),
    case when v_invited then 'marketplace_invite_accepted' else 'marketplace_signed' end,
    coalesce(v_profile.full_name, 'A creator') || ' signed',
    'They start ' || to_char(v_start, 'FMMonth FMDD') || '.',
    'noni://manager/' || v_app.company_id || '/creator/' || v_uid,
    jsonb_build_object('listing_id', v_listing.id, 'application_id', v_app.id, 'creator_id', v_uid)
  );
  return v_app;
end;
$$;

grant execute on function public.sign_creator_agreement(uuid, text, text) to authenticated;

-- A re-offer or a new invite starts with no signature.
create or replace function public.stamp_signature()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_headers json;
begin
  if new.signed_at is null then
    new.signed_ip := null;
    new.signed_user_agent := null;
    new.signature_svg := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.signed_at is not distinct from old.signed_at then
    return new;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  new.signed_ip := left(nullif(trim(split_part(
    coalesce(nullif(v_headers ->> 'x-signer-ip', ''), v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''), 64);
  new.signed_user_agent := left(nullif(trim(
    coalesce(nullif(v_headers ->> 'x-signer-agent', ''), v_headers ->> 'user-agent', '')), ''), 400);
  return new;
end;
$$;

create or replace function public.marketplace_notify(
  p_company_id uuid, p_profile_ids uuid[], p_event text, p_title text, p_body text, p_link text, p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb := p_data || jsonb_build_object('event', p_event, 'company_id', p_company_id, 'deep_link', p_link);
  v_messages jsonb;
begin
  -- A notification must never fail the action it reports.
  begin
    insert into public.notifications (company_id, profile_id, event, title, body, deep_link, data)
    select p_company_id, pid, p_event, p_title, p_body, p_link, v_data
    from unnest(p_profile_ids) pid;
  exception when others then
    raise warning 'marketplace_notify: %', sqlerrm;
  end;
  -- The push, straight to Expo (the same call _shared/push.ts makes).
  begin
    select jsonb_agg(jsonb_build_object(
      'to', p.expo_push_token, 'title', p_title, 'body', p_body, 'sound', 'default', 'data', v_data))
    into v_messages
    from public.profiles p
    where p.id = any (p_profile_ids) and nullif(p.expo_push_token, '') is not null;
    if v_messages is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_messages,
        timeout_milliseconds := 10000
      );
    end if;
  exception when others then
    raise warning 'marketplace_notify push: %', sqlerrm;
  end;
end;
$$;

revoke execute on function public.marketplace_notify(uuid, uuid[], text, text, text, text, jsonb) from public, anon, authenticated;
