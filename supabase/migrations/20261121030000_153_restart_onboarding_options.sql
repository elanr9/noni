-- 153: restart_onboarding (151) also clears the cached company question
-- choices (onboarding_options, 152). Testing only.
-- onboarding: the chat, the intake answers, the done marks, and everything
-- the site scan learned (so the next scan starts fresh). Called by the web
-- for allowlisted tester accounts only (src/lib/onboarding-tester.ts).
create or replace function public.restart_onboarding(p_company uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.brain_conflicts where company_id = p_company;
  delete from public.brain_questions where company_id = p_company;
  delete from public.brain_chunks where company_id = p_company;
  delete from public.brain_facts where company_id = p_company;
  delete from public.brain_sources where company_id = p_company;
  delete from public.brain_ingest where company_id = p_company;
  delete from public.brain_survey where company_id = p_company;

  update public.companies
  set onboarding_chat = '{}'::jsonb,
      intake = '{}'::jsonb,
      onboarding_options = '{}'::jsonb,
      onboarded_at = null
  where id = p_company;

  update public.profiles set onboarded = false where id = p_user;
end
$fn$;

revoke all on function public.restart_onboarding(uuid, uuid) from public, anon, authenticated;
grant execute on function public.restart_onboarding(uuid, uuid) to service_role;
