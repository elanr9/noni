-- Messages tab rebuild (ANALYTICS_AND_MESSAGES_HANDOFF 2.7, 2.9).
-- Channels reuse manager_chats; creator threads gain read markers; review
-- notes gain a structured column so post threads can render them as rows.

-- 1. Channels on manager_chats ----------------------------------------------

alter table public.manager_chats
  drop constraint if exists manager_chats_brief_shape;
alter table public.manager_chats
  drop constraint if exists manager_chats_kind_check;

alter table public.manager_chats
  add column if not exists name text,
  add column if not exists all_creators boolean not null default false,
  add column if not exists created_by uuid references public.profiles;

alter table public.manager_chats
  add constraint manager_chats_kind_check check (kind in ('brief', 'dm', 'channel'));

alter table public.manager_chats add constraint manager_chats_shape check (
  (kind = 'brief' and campaign_id is not null and user_a is null and user_b is null)
  or (kind = 'dm' and campaign_id is null and user_a is not null and user_b is not null and user_a < user_b)
  or (kind = 'channel' and campaign_id is null and user_a is null and user_b is null and name is not null)
);

create unique index if not exists manager_chats_channel_name
  on public.manager_chats (company_id, name) where kind = 'channel';

create table if not exists public.manager_chat_members (
  chat_id    uuid not null references public.manager_chats on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (chat_id, profile_id)
);

alter table public.manager_chat_members enable row level security;

-- 2. Read markers for creator threads ---------------------------------------

create table if not exists public.message_reads (
  company_id   uuid not null references public.companies on delete cascade,
  creator_id   uuid not null references public.profiles on delete cascade,
  profile_id   uuid not null references public.profiles on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (creator_id, profile_id)
);

alter table public.message_reads enable row level security;

create policy "own message reads" on public.message_reads
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and company_id = public.current_company_id());

-- 3. Structured review notes ------------------------------------------------

alter table public.review_events
  add column if not exists notes jsonb;

comment on column public.review_events.notes is
  'Structured send-back notes: [{ "label": "Point 3", "text": "..." }]. Null on legacy rows; note keeps the flat text.';

-- Backfill: Review wrote "Label: text" blocks joined by blank lines.
update public.review_events e
set notes = sub.notes
from (
  select id,
         jsonb_agg(
           case
             when part ~ '^[^:\n]{1,40}:\s' then jsonb_build_object(
               'label', btrim(split_part(part, ':', 1)),
               'text', btrim(substr(part, position(':' in part) + 1))
             )
             else jsonb_build_object('label', 'Whole post', 'text', btrim(part))
           end
           order by ord
         ) as notes
  from public.review_events,
       unnest(regexp_split_to_array(note, E'\n\n+')) with ordinality as parts(part, ord)
  where action = 'changes_requested'
    and note is not null
    and btrim(note) <> ''
    and btrim(part) <> ''
  group by id
) sub
where e.id = sub.id and e.notes is null;

-- 4. Chat access helper -----------------------------------------------------
-- One security definer check so the four chat tables agree on who may see a
-- chat. Brief chats: every manager. DMs: the two people. Channels: members,
-- the company admin, and creators of the company when all_creators is on.

create or replace function public.can_access_manager_chat(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manager_chats c
    where c.id = p_chat_id
      and c.company_id = public.current_company_id()
      and (
        (
          public.is_campaign_manager()
          and (
            c.kind = 'brief'
            or auth.uid() = c.user_a
            or auth.uid() = c.user_b
            or (
              c.kind = 'channel'
              and (
                public.is_company_admin()
                or c.created_by = auth.uid()
                or exists (
                  select 1 from public.manager_chat_members m
                  where m.chat_id = c.id and m.profile_id = auth.uid()
                )
              )
            )
          )
        )
        or (
          c.kind = 'channel'
          and c.all_creators
          and exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.company_id = c.company_id
              and (p.role = 'creator' or p.can_create)
          )
        )
      )
  )
$$;

-- 5. Replace the chat policies so channels and creators are covered --------

drop policy if exists "managers read company chats" on public.manager_chats;
drop policy if exists "managers insert company chats" on public.manager_chats;
drop policy if exists "managers read company chat messages" on public.manager_messages;
drop policy if exists "managers insert company chat messages" on public.manager_messages;
drop policy if exists "managers react on company chat messages" on public.manager_message_reactions;
drop policy if exists "managers read own chat reads" on public.manager_chat_reads;

create policy "read accessible chats" on public.manager_chats
  for select using (public.can_access_manager_chat(id));

create policy "managers insert company chats" on public.manager_chats
  for insert with check (
    company_id = public.current_company_id()
    and public.is_campaign_manager()
    and (
      kind = 'brief'
      or auth.uid() = user_a
      or auth.uid() = user_b
      or (kind = 'channel' and created_by = auth.uid())
    )
  );

create policy "managers update own channels" on public.manager_chats
  for update using (
    kind = 'channel'
    and public.is_campaign_manager()
    and public.can_access_manager_chat(id)
  )
  with check (kind = 'channel' and company_id = public.current_company_id());

create policy "read accessible chat messages" on public.manager_messages
  for select using (
    company_id = public.current_company_id()
    and public.can_access_manager_chat(chat_id)
  );

create policy "insert into accessible chats" on public.manager_messages
  for insert with check (
    company_id = public.current_company_id()
    and author_id = auth.uid()
    and public.can_access_manager_chat(chat_id)
  );

create policy "react in accessible chats" on public.manager_message_reactions
  for all using (
    exists (
      select 1 from public.manager_messages m
      where m.id = message_id
        and public.can_access_manager_chat(m.chat_id)
    )
  )
  with check (profile_id = auth.uid());

create policy "own chat reads" on public.manager_chat_reads
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "read members of accessible chats" on public.manager_chat_members
  for select using (public.can_access_manager_chat(chat_id));

create policy "managers manage channel members" on public.manager_chat_members
  for insert with check (
    public.is_campaign_manager()
    and (
      public.can_access_manager_chat(chat_id)
      or exists (
        select 1 from public.manager_chats c
        where c.id = chat_id and c.created_by = auth.uid()
      )
    )
  );

create policy "leave or remove channel members" on public.manager_chat_members
  for delete using (
    profile_id = auth.uid()
    or (public.is_campaign_manager() and public.can_access_manager_chat(chat_id))
  );

-- Creators read the chat media of channels they are in (manager-chat bucket).
create policy "channel creators read chat media" on storage.objects for select
  using (
    bucket_id = 'manager-chat'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and exists (
      select 1 from public.manager_chats c
      where c.company_id = public.current_company_id()
        and c.kind = 'channel'
        and c.all_creators
        and public.can_access_manager_chat(c.id)
    )
  );
