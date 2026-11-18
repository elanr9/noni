-- One-click "Connect Supabase" for sign-ups.
--
-- A company approves Noni on Supabase's consent screen (a Supabase OAuth app
-- asking for read-only access). Noni keeps the refresh token, encrypted in
-- Vault, and sync-conversions reads a count of sign-ups per day and referral
-- code from the company's auth.users through Supabase's read-only query
-- endpoint. Nothing is installed in the company's project and no user row is
-- ever stored here.

alter table public.company_signup_sources
  add column if not exists project_ref text,
  add column if not exists project_name text,
  -- Projects the company approved, [{ "ref": "...", "name": "..." }]; shown
  -- when there are several and the admin has to pick one.
  add column if not exists projects jsonb,
  add column if not exists connected_at timestamptz,
  add column if not exists last_error text;

-- The refresh token lives in Vault under one name per company. Service role only.
create or replace function public.set_supabase_refresh_token(p_company uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := 'supabase_refresh_' || p_company::text;
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if p_token is null or p_token = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(p_token, v_name);
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end;
$$;

create or replace function public.get_supabase_refresh_token(p_company uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'supabase_refresh_' || p_company::text
$$;

revoke all on function public.set_supabase_refresh_token(uuid, text) from public, anon, authenticated;
revoke all on function public.get_supabase_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.set_supabase_refresh_token(uuid, text) to service_role;
grant execute on function public.get_supabase_refresh_token(uuid) to service_role;

-- Sign-ups refresh every hour (the full sales sync stays daily).
select cron.schedule(
  'noni-sync-signups-hourly',
  '20 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/sync-conversions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"only":"signups"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
