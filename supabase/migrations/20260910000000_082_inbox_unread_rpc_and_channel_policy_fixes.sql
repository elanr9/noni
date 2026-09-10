-- Follow-ups to 079 after review.
-- 1. Chat media in manager-chat is stored per company, not per chat, so a
--    creator in one all_creators channel could read every DM attachment.
--    Creators have no channel UI yet; drop the policy until media is per chat.
-- 2. Only the member themself may leave; only the channel creator may remove
--    others, and the creator can never be removed.
-- 3. One cheap RPC for the Messages tab badge instead of downloading rows.

drop policy if exists "channel creators read chat media" on storage.objects;

drop policy if exists "leave or remove channel members" on public.manager_chat_members;
create policy "leave or remove channel members" on public.manager_chat_members
  for delete using (
    profile_id <> (select c.created_by from public.manager_chats c where c.id = chat_id)
    and (
      profile_id = auth.uid()
      or exists (
        select 1 from public.manager_chats c
        where c.id = chat_id and c.created_by = auth.uid()
      )
    )
  );

create or replace function public.unread_inbox_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select (
    (
      select count(*)
      from public.messages m
      where m.company_id = public.current_company_id()
        and m.author_id = m.creator_id
        and m.author_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.message_reads r
            where r.creator_id = m.creator_id and r.profile_id = auth.uid()),
          'epoch'::timestamptz)
    )
    +
    (
      select count(*)
      from public.manager_messages mm
      join public.manager_chats c on c.id = mm.chat_id
      where c.company_id = public.current_company_id()
        and mm.author_id <> auth.uid()
        and public.can_access_manager_chat(c.id)
        and mm.created_at > coalesce(
          (select r.last_read_at from public.manager_chat_reads r
            where r.chat_id = mm.chat_id and r.profile_id = auth.uid()),
          'epoch'::timestamptz)
    )
  )::integer;
$$;

grant execute on function public.unread_inbox_count() to authenticated;
