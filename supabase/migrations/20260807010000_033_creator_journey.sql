-- Creator journey rebuild: onboarding answers, auto profile bootstrap for
-- App Store signups, and per-clip recording drafts.

-- 1. Onboarding fields on profiles
alter table public.profiles
  add column if not exists birthday date,
  add column if not exists phone text,
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;

comment on column public.profiles.onboarding_answers is
  'Cal-AI style onboarding answers: ugc_experience, hardest_part, hours_per_week, heard_from, plus setup flags (warmup_tutorial_seen).';

-- 2. Bootstrap a creator profile for brand-new auth users.
-- Single-tenant for now: new signups join the oldest company (FieldVision).
-- Admins are seeded manually, so the trigger always assigns role creator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select id into v_company from public.companies order by created_at asc limit 1;
  if v_company is null then
    return new;
  end if;
  insert into public.profiles (id, company_id, role, full_name, onboarded)
  values (
    new.id,
    v_company,
    'creator',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Per-clip recording drafts: save progress between clips.
-- segments jsonb = array of {slot_index, kind, storage_path, duration_ms}.
create table if not exists public.recording_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  assignment_id uuid not null unique references public.assignments on delete cascade,
  creator_id uuid not null references public.profiles,
  segments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.recording_drafts enable row level security;

create policy "creators manage own recording drafts" on public.recording_drafts
  for all
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid() and company_id = public.current_company_id());

create policy "admins read recording drafts" on public.recording_drafts
  for select
  using (company_id = public.current_company_id() and public.is_admin());
