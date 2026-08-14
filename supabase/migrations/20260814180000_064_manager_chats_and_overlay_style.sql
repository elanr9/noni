-- Manager messaging (one group chat per week/brief + DMs) and per-segment
-- overlay style for the talking-point composer.

-- 1. Per-point overlay chrome (color + background pill) ----------------------

alter table public.brief_segments
  add column if not exists overlay_style jsonb not null default '{}'::jsonb;

comment on column public.brief_segments.overlay_style is
  'Talking-point overlay chrome: { color: hex, bg: boolean }. Text lives in overlay_text.';

-- 2. Manager chats -----------------------------------------------------------

create table public.manager_chats (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies on delete cascade,
  kind         text not null check (kind in ('brief', 'dm')),
  campaign_id  uuid references public.campaigns on delete cascade,
  user_a       uuid references public.profiles on delete cascade,
  user_b       uuid references public.profiles on delete cascade,
  created_at   timestamptz not null default now(),
  constraint manager_chats_brief_shape check (
    (kind = 'brief' and campaign_id is not null and user_a is null and user_b is null)
    or
    (kind = 'dm' and campaign_id is null and user_a is not null and user_b is not null and user_a < user_b)
  )
);

create unique index manager_chats_brief_unique
  on public.manager_chats (company_id, campaign_id)
  where kind = 'brief';

create unique index manager_chats_dm_unique
  on public.manager_chats (company_id, user_a, user_b)
  where kind = 'dm';

create table public.manager_messages (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies on delete cascade,
  chat_id            uuid not null references public.manager_chats on delete cascade,
  author_id          uuid not null references public.profiles,
  body               text not null default '',
  reply_to_id        uuid references public.manager_messages on delete set null,
  forward_label      text,
  assignment_id      uuid references public.assignments on delete set null,
  brief_id           uuid references public.briefs on delete set null,
  media_kind         text check (media_kind in ('image', 'video', 'voice')),
  media_path         text,
  voice_duration_ms  int,
  created_at         timestamptz not null default now()
);

create index manager_messages_chat_created
  on public.manager_messages (chat_id, created_at);

create table public.manager_message_reactions (
  message_id  uuid not null references public.manager_messages on delete cascade,
  profile_id  uuid not null references public.profiles on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

create table public.manager_chat_reads (
  chat_id       uuid not null references public.manager_chats on delete cascade,
  profile_id    uuid not null references public.profiles on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (chat_id, profile_id)
);

alter table public.manager_chats enable row level security;
alter table public.manager_messages enable row level security;
alter table public.manager_message_reactions enable row level security;
alter table public.manager_chat_reads enable row level security;

create policy "managers read company chats" on public.manager_chats
  for select using (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and (
      kind = 'brief'
      or auth.uid() = user_a
      or auth.uid() = user_b
    )
  );

create policy "managers insert company chats" on public.manager_chats
  for insert with check (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and (
      kind = 'brief'
      or auth.uid() = user_a
      or auth.uid() = user_b
    )
  );

create policy "managers read company chat messages" on public.manager_messages
  for select using (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and exists (
      select 1 from public.manager_chats c
      where c.id = chat_id
        and c.company_id = public.current_company_id()
        and (
          c.kind = 'brief'
          or auth.uid() = c.user_a
          or auth.uid() = c.user_b
        )
    )
  );

create policy "managers insert company chat messages" on public.manager_messages
  for insert with check (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and author_id = auth.uid()
    and exists (
      select 1 from public.manager_chats c
      where c.id = chat_id
        and c.company_id = public.current_company_id()
        and (
          c.kind = 'brief'
          or auth.uid() = c.user_a
          or auth.uid() = c.user_b
        )
    )
  );

create policy "managers react on company chat messages" on public.manager_message_reactions
  for all using (
    public.is_campaign_manager()
    and exists (
      select 1 from public.manager_messages m
      join public.manager_chats c on c.id = m.chat_id
      where m.id = message_id
        and m.company_id = public.current_company_id()
        and (
          c.kind = 'brief'
          or auth.uid() = c.user_a
          or auth.uid() = c.user_b
        )
    )
  )
  with check (
    profile_id = auth.uid()
    and public.is_campaign_manager()
  );

create policy "managers read own chat reads" on public.manager_chat_reads
  for all using (
    profile_id = auth.uid()
    and public.is_campaign_manager()
  )
  with check (
    profile_id = auth.uid()
    and public.is_campaign_manager()
  );

-- Fellow managers on the same account, for avatars and DM rows.
create policy "managers read company members" on public.company_members
  for select using (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
  );

-- 3. Chat media bucket -------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manager-chat', 'manager-chat', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/mp4', 'audio/m4a', 'audio/mpeg', 'audio/x-m4a']
)
on conflict (id) do nothing;

create policy "managers read chat media" on storage.objects for select
  using (
    bucket_id = 'manager-chat'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_campaign_manager()
  );

create policy "managers write chat media" on storage.objects for insert
  with check (
    bucket_id = 'manager-chat'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_campaign_manager()
  );
