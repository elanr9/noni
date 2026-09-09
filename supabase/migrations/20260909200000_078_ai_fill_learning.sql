-- AI fill learning loop.
--
-- Every "fill with AI" freezes a copy of the post the model produced. When the
-- campaign manager publishes, the published post is compared with that copy
-- and the difference is stored as a structured diff. A nightly job (and a
-- fire-and-forget call from publish-campaign) distills the diffs into
-- learnings, per company and across all companies, that ride along in every
-- generation prompt. The diffs double as a supervised fine tuning dataset.

-- ---------------------------------------------------------------------------
-- brief_ai_snapshots: the model's version of a post, frozen at fill time.
-- One row per brief; a re-fill replaces it (the manager is comparing against
-- the latest thing the AI handed them).

create table public.brief_ai_snapshots (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies on delete cascade,
  brief_id       uuid not null references public.briefs on delete cascade,
  generation_id  uuid,
  source_kind    text not null check (source_kind in ('port', 'example', 'idea', 'feature', 'auto')),
  post_type_key  text,
  snapshot       jsonb not null,
  created_by     uuid references public.profiles on delete set null,
  created_at     timestamptz not null default now(),
  unique (brief_id)
);

create index brief_ai_snapshots_company on public.brief_ai_snapshots (company_id, created_at desc);

alter table public.brief_ai_snapshots enable row level security;

create policy "same company read ai snapshots" on public.brief_ai_snapshots
  for select using (company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- brief_edit_diffs: what the manager changed before publishing.

create table public.brief_edit_diffs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies on delete cascade,
  brief_id        uuid not null references public.briefs on delete cascade,
  snapshot_id     uuid not null references public.brief_ai_snapshots on delete cascade,
  campaign_id     uuid references public.campaigns on delete set null,
  post_type_key   text,
  source_kind     text not null,
  final_snapshot  jsonb not null,
  diff            jsonb not null,
  changed_fields  text[] not null default '{}',
  edit_ratio      numeric(5,4) not null default 0,
  published_at    timestamptz not null default now(),
  learned_at      timestamptz,
  global_learned_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (brief_id)
);

create index brief_edit_diffs_company_unlearned
  on public.brief_edit_diffs (company_id, published_at)
  where learned_at is null;

create index brief_edit_diffs_global_unlearned
  on public.brief_edit_diffs (published_at)
  where global_learned_at is null;

alter table public.brief_edit_diffs enable row level security;

create policy "same company read edit diffs" on public.brief_edit_diffs
  for select using (company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- ai_learnings: distilled rules. company_id null is a global learning shared
-- by every company. Written only by the service role.

create table public.ai_learnings (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies on delete cascade,
  category        text not null check (category in (
    'hook', 'talking_points', 'script', 'caption', 'hashtags', 'cta',
    'overlay_text', 'screenshots', 'layout', 'structure', 'voice', 'other'
  )),
  insight         text not null,
  confidence      numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  evidence_count  int not null default 1,
  examples        jsonb not null default '[]'::jsonb,
  source_diff_ids uuid[] not null default '{}',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index ai_learnings_company_active
  on public.ai_learnings (company_id, active, confidence desc);

alter table public.ai_learnings enable row level security;

create policy "read own and global learnings" on public.ai_learnings
  for select using (company_id is null or company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- brief_snapshot_json: the one shape both sides of the comparison use.

create or replace function public.brief_snapshot_json(p_brief_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'brief',
      to_jsonb(b)
        - 'company_id' - 'created_at' - 'created_by' - 'archived_at'
        - 'review_result' - 'reviewed_at' - 'example_transcript',
    'post_type_key', pt.key,
    'segments',
      coalesce(
        (
          select jsonb_agg(
            (to_jsonb(s) - 'id' - 'company_id' - 'brief_id' - 'created_at')
            order by s.slot_index
          )
          from public.brief_segments s
          where s.brief_id = b.id
        ),
        '[]'::jsonb
      )
  )
  from public.briefs b
  left join public.post_types pt on pt.id = b.post_type_id
  where b.id = p_brief_id;
$$;

-- snapshot_ai_brief: called by the app right after a fill lands.

create or replace function public.snapshot_ai_brief(
  p_brief_id uuid,
  p_source_kind text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_generation uuid;
  v_snapshot jsonb;
  v_id uuid;
begin
  select company_id, generation_id into v_company, v_generation
  from public.briefs where id = p_brief_id;
  if v_company is null then
    raise exception 'brief not found';
  end if;
  if v_company <> public.current_company_id() or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  v_snapshot := public.brief_snapshot_json(p_brief_id);

  insert into public.brief_ai_snapshots
    (company_id, brief_id, generation_id, source_kind, post_type_key, snapshot, created_by)
  values
    (v_company, p_brief_id, v_generation, p_source_kind,
     v_snapshot->>'post_type_key', v_snapshot, auth.uid())
  on conflict (brief_id) do update set
    generation_id = excluded.generation_id,
    source_kind   = excluded.source_kind,
    post_type_key = excluded.post_type_key,
    snapshot      = excluded.snapshot,
    created_by    = excluded.created_by,
    created_at    = now()
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.brief_snapshot_json(uuid) to authenticated, service_role;
grant execute on function public.snapshot_ai_brief(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Nightly distillation. Same pattern as 008_wp8_cron.sql.

select cron.schedule(
  'noni-learn-from-edits-nightly',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/learn-from-edits',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
