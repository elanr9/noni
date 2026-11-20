-- Invite only at the door. Until now anyone could press "Continue with
-- Google" and get an auth user; handle_new_user simply made no profile for
-- them, so they had no access but the login record stayed behind. This
-- before-user-created auth hook refuses to create the user at all unless a
-- pending, unexpired invite exists for that email.
--
-- Enabled in the project's auth settings as
--   pg-functions://postgres/public/hook_require_invite
-- It runs only when a user would be created, never on a returning sign-in.

create or replace function public.hook_require_invite(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_email <> '' and exists (
    select 1
    from public.company_invites i
    where lower(i.email) = v_email
      and i.accepted_at is null
      and i.expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Noni is invite only. Sign in with the email your invite was sent to, or ask your company for an invite.'
    )
  );
end;
$$;

revoke execute on function public.hook_require_invite(jsonb) from public, anon, authenticated;
grant execute on function public.hook_require_invite(jsonb) to supabase_auth_admin;
