-- 147: The company summary the founder confirms at the end of onboarding:
-- what the company sells, who its UGC speaks to, core features and the one
-- viral feature (see buildCompanySnapshot in _shared/ai/brain.ts).
alter table public.brain_survey
  add column if not exists snapshot jsonb;
