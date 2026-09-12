-- Creators join messaging. Brief chats include the creators assigned to
-- that campaign; creators and managers can DM each other through
-- manager_chats (kind dm).

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

drop policy if exists "managers insert company chats" on public.manager_chats;
create policy "insert company chats" on public.manager_chats
  for insert with check (
    company_id = public.current_company_id()
    and (
      (
        public.is_campaign_manager()
        and (
          kind = 'brief'
          or auth.uid() in (user_a, user_b)
          or (kind = 'channel' and created_by = auth.uid())
        )
      )
      or (
        kind = 'dm'
        and auth.uid() in (user_a, user_b)
        and exists (
          select 1 from public.profiles p
          where p.id = case when user_a = auth.uid() then user_b else user_a end
            and p.company_id = public.current_company_id()
            and p.role in ('campaign_manager', 'company_admin')
        )
      )
      or (
        kind = 'brief'
        and exists (
          select 1 from public.assignments a
          where a.campaign_id = manager_chats.campaign_id
            and a.company_id = public.current_company_id()
            and a.creator_id = auth.uid()
        )
      )
    )
  );
