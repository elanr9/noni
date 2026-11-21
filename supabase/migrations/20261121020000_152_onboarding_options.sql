-- 152: The answer choices the onboarding chat offers for the company
-- questions (what it does, who it is for, price, call to action, what never
-- to say), written by the model from the site scan once and reused.
--   { status: 'generating' | 'ready', at, sells: [], audience: [], price: [], cta: [], never_say: [] }
alter table public.companies
  add column if not exists onboarding_options jsonb not null default '{}'::jsonb;
