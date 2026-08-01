-- Inspiration engine phase 1: brand docs, source accounts, templates,
-- hook bank, relevance gate columns, labels, draft snapshots.

-- Brand knowledge as four separate documents. product_truth, audience_niche
-- and voice are human owned; learnings is machine written, append only.
create table public.brand_docs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  kind text not null check (kind in ('product_truth', 'audience_niche', 'voice', 'learnings')),
  content text not null default '',
  human_edited boolean not null default false,
  updated_at timestamptz default now(),
  unique (company_id, kind)
);

-- The account universe: handle-first sourcing scrapes these directly.
create table public.source_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  platform text not null check (platform in ('tiktok', 'instagram')),
  handle text not null,
  kind text not null default 'reference' check (kind in ('reference', 'discovered')),
  status text not null default 'active' check (status in ('active', 'muted')),
  last_scraped_at timestamptz,
  keeper_count int not null default 0,
  scraped_count int not null default 0,
  created_at timestamptz default now(),
  unique (company_id, platform, handle)
);

-- Reusable post skeletons extracted once per gate-passing trend item.
create table public.content_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  source_trend_id uuid references public.trend_items,
  pattern_type text not null,
  hook_line text,
  hook_visual text,
  beats jsonb,
  cta text,
  format text not null default 'video' check (format in ('video', 'carousel')),
  niche_tags text[] default '{}',
  created_at timestamptz default now()
);

create table public.hook_bank (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  hook text not null,
  format text not null default 'video' check (format in ('video', 'carousel')),
  niche_tags text[] default '{}',
  source_trend_id uuid references public.trend_items,
  created_at timestamptz default now()
);

-- Relevance gate, carousel capture, labeling, remake mode.
alter table public.trend_items
  add column format text not null default 'video' check (format in ('video', 'carousel')),
  add column image_urls jsonb,
  add column slide_texts jsonb,
  add column caption text,
  add column relevance_score int,
  add column relevance_reason text,
  add column source_kind text default 'search' check (source_kind in ('handle', 'search')),
  add column label text check (label in ('keep', 'kill')),
  add column label_reason text,
  add column labeled_by uuid references public.profiles,
  add column is_golden boolean not null default false,
  add column remake_mode text check (remake_mode in ('beat_for_beat', 'structure_only')),
  add column remake_reason text,
  add column remake_mode_overridden boolean not null default false;

create index trend_items_company_relevance
  on public.trend_items (company_id, relevance_score desc nulls last, views desc nulls last);

-- Draft snapshot for edit-diff capture, generation attribution, feedback.
alter table public.content_tasks
  add column original_draft jsonb,
  add column generation_meta jsonb,
  add column feedback smallint check (feedback in (-1, 1)),
  add column feedback_reason text;

-- Saved search terms with keeper stats.
alter table public.brand_profiles
  add column sourcing jsonb not null default '{}'::jsonb;

-- RLS

alter table public.brand_docs enable row level security;
alter table public.source_accounts enable row level security;
alter table public.content_templates enable row level security;
alter table public.hook_bank enable row level security;

create policy "same company read brand docs" on public.brand_docs for select
  using (company_id = public.current_company_id());

create policy "admins write brand docs" on public.brand_docs for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read source accounts" on public.source_accounts for select
  using (company_id = public.current_company_id());

create policy "admins write source accounts" on public.source_accounts for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read templates" on public.content_templates for select
  using (company_id = public.current_company_id());

create policy "admins write templates" on public.content_templates for all
  using (company_id = public.current_company_id() and public.is_admin());

create policy "same company read hooks" on public.hook_bank for select
  using (company_id = public.current_company_id());

create policy "admins write hooks" on public.hook_bank for all
  using (company_id = public.current_company_id() and public.is_admin());

-- Creators can label trends (thumbs on the inspiration feed) but must not be
-- able to edit anything else on trend_items, so labeling goes through an RPC
-- instead of an update policy. Admin labels mark the item golden.
create or replace function public.label_trend(
  p_trend_id uuid,
  p_label text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_label is not null and p_label not in ('keep', 'kill') then
    raise exception 'invalid label';
  end if;
  update public.trend_items
  set label = p_label,
      label_reason = p_reason,
      labeled_by = auth.uid(),
      is_golden = case when public.is_admin() and p_label is not null then true
                       when p_label is null then false
                       else is_golden end
  where id = p_trend_id
    and company_id = public.current_company_id();
  if not found then
    raise exception 'trend not found';
  end if;
end;
$$;
