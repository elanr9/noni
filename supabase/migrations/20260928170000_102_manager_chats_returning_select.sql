-- can_access_manager_chat is STABLE, so inside INSERT ... RETURNING it reads
-- the statement's starting snapshot and cannot see the row just inserted.
-- The RETURNING select check then fails with "new row violates row-level
-- security policy" and the inbox (which auto-creates manager DMs) cannot
-- load for campaign managers. Check the row's own columns inline for the
-- cases a user creates for themself: DMs they are in and channels they made.

drop policy if exists "read accessible chats" on public.manager_chats;
create policy "read accessible chats" on public.manager_chats
  for select using (
    public.can_access_manager_chat(id)
    or (
      public.is_member_of(company_id)
      and (
        (kind = 'dm' and auth.uid() in (user_a, user_b))
        or (kind = 'channel' and created_by = auth.uid())
      )
    )
  );
