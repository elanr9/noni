-- 150: The onboarding conversation (web /onboarding, edge function
-- onboarding-chat): the messages so far and which agenda slots are answered,
-- so a refresh or a return visit resumes the chat in place.
--   { messages: [{ role: 'assistant'|'user', text, slot }],
--     answered: string[], followups: { [slot]: number } }
alter table public.companies
  add column if not exists onboarding_chat jsonb not null default '{}'::jsonb;
