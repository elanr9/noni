-- 148: Survey answers are written one key at a time, atomically, so an answer
-- saved while another is still being processed in the background cannot
-- overwrite it (the answers column is one jsonb object).
create or replace function public.brain_survey_put_answer(p_company uuid, p_key text, p_answer jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.brain_survey (company_id, answers, updated_at)
  values (p_company, jsonb_build_object(p_key, p_answer), now())
  on conflict (company_id) do update
    set answers = coalesce(public.brain_survey.answers, '{}'::jsonb) || jsonb_build_object(p_key, p_answer),
        updated_at = now();
$$;

-- Fills in the records an answer produced, only if that answer is still the
-- one on file (a newer answer to the same question keeps its own).
create or replace function public.brain_survey_set_answer_facts(p_company uuid, p_key text, p_answered_at text, p_fact_ids jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.brain_survey
  set answers = jsonb_set(answers, array[p_key, 'fact_ids'], p_fact_ids)
  where company_id = p_company
    and answers -> p_key ->> 'answered_at' = p_answered_at;
$$;

revoke all on function public.brain_survey_put_answer(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.brain_survey_set_answer_facts(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.brain_survey_put_answer(uuid, text, jsonb) to service_role;
grant execute on function public.brain_survey_set_answer_facts(uuid, text, text, jsonb) to service_role;
