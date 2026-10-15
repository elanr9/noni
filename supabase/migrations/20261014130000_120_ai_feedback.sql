-- ai_feedback: every signal a manager gives the AI, captured as it happens.
-- edit: the AI wrote `before`, the manager saved `after` (per slide or field).
-- dismiss: the manager rejected an idea (`before` is its cover).
-- revise: the manager's own words in Revise with AI (`note`).
-- approve: the manager kept AI text as is (`before`).
-- write-deck reads the latest rows into its prompt so the very next
-- generation learns from them; learn-from-edits can distill them later.
create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  created_by uuid references public.profiles default auth.uid(),
  kind text not null check (kind in ('edit', 'dismiss', 'revise', 'approve')),
  surface text not null default 'editor',
  format text,
  post_type text,
  role text,
  before text,
  after text,
  note text,
  brief_id uuid references public.briefs on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_feedback_company_created on public.ai_feedback (company_id, created_at desc);

alter table public.ai_feedback enable row level security;

create policy "same company read ai feedback" on public.ai_feedback
  for select using (company_id = public.current_company_id());

create policy "same company write ai feedback" on public.ai_feedback
  for insert with check (company_id = public.current_company_id());
