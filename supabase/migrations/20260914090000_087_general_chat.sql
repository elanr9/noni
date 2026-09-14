-- One General chat per company replaces the per-week brief chats. Every
-- member of the company (managers and creators) can read and post in it;
-- it is created with the company and cannot be left or deleted.

alter table public.manager_chats
  add column if not exists is_general boolean not null default false;

create unique index if not exists manager_chats_general_unique
  on public.manager_chats (company_id) where is_general;

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
        c.is_general
        or (
          c.kind = 'brief'
          and (
            public.is_campaign_manager()
            or exists (
              select 1 from public.assignments a
              where a.campaign_id = c.campaign_id
                and a.company_id = c.company_id
                and a.creator_id = auth.uid()
            )
          )
        )
        or (c.kind = 'dm' and auth.uid() in (c.user_a, c.user_b))
        or (
          c.kind = 'channel'
          and (
            (
              public.is_campaign_manager()
              and (
                public.is_company_admin()
                or c.created_by = auth.uid()
                or exists (
                  select 1 from public.manager_chat_members m
                  where m.chat_id = c.id and m.profile_id = auth.uid()
                )
              )
            )
            or (
              c.all_creators
              and exists (
                select 1 from public.profiles p
                where p.id = auth.uid()
                  and p.company_id = c.company_id
                  and (p.role = 'creator' or p.can_create)
              )
            )
          )
        )
      )
  )
$$;

-- Nobody edits or removes the General chat from the app.
drop policy if exists "no changes to general chat" on public.manager_chats;
create policy "no changes to general chat" on public.manager_chats
  as restrictive for update using (not is_general);

drop policy if exists "no deleting general chat" on public.manager_chats;
create policy "no deleting general chat" on public.manager_chats
  as restrictive for delete using (not is_general);

-- Backfill: adopt an existing #general channel, otherwise create one.
update public.manager_chats
set is_general = true, all_creators = true
where kind = 'channel'
  and name = 'general'
  and not exists (
    select 1 from public.manager_chats g
    where g.company_id = manager_chats.company_id and g.is_general
  );

insert into public.manager_chats (company_id, kind, name, all_creators, is_general)
select c.id, 'channel', 'general', true, true
from public.companies c
where not exists (
  select 1 from public.manager_chats g
  where g.company_id = c.id and g.is_general
);

-- Every new company starts with its General chat.
create or replace function public.create_general_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.manager_chats (company_id, kind, name, all_creators, is_general)
  values (new.id, 'channel', 'general', true, true)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists companies_create_general_chat on public.companies;
create trigger companies_create_general_chat
  after insert on public.companies
  for each row execute function public.create_general_chat();
