-- 164: a company and a creator who applied (or was invited) can write to each
-- other on the application. One thread per application, plain text.
--
-- marketplace_messages          one row per message
-- send_application_message      either side writes; the other side is notified
-- application_messages          the thread, oldest first; marks the other
--                               side's messages as read
-- marketplace_creators rows are unchanged; unread counts come from
-- application_unread().

create table if not exists public.marketplace_messages (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.marketplace_applications on delete cascade,
  company_id      uuid not null references public.companies on delete cascade,
  sender_id       uuid references public.profiles on delete set null,
  from_company    boolean not null,
  body            text not null check (length(body) between 1 and 1000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists marketplace_messages_thread_idx
  on public.marketplace_messages (application_id, created_at);

alter table public.marketplace_messages enable row level security;

drop policy if exists marketplace_messages_read on public.marketplace_messages;
create policy marketplace_messages_read on public.marketplace_messages
  for select to authenticated
  using (
    public.is_platform_admin()
    or (company_id = public.current_company_id() and public.is_campaign_manager())
    or exists (
      select 1 from public.marketplace_applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

-- Which side of the application the caller is on: 'company', 'creator' or null.
create or replace function public.application_side(p_application uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.creator_id = auth.uid() then 'creator'
    when a.company_id = public.current_company_id() and public.is_campaign_manager() then 'company'
    else null
  end
  from public.marketplace_applications a
  where a.id = p_application;
$$;

revoke execute on function public.application_side(uuid) from public, anon, authenticated;

create or replace function public.send_application_message(p_application uuid, p_body text)
returns public.marketplace_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text;
  v_app public.marketplace_applications;
  v_listing public.marketplace_listings;
  v_company public.companies;
  v_name text;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
  v_row public.marketplace_messages;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  v_side := public.application_side(p_application);
  if v_side is null then
    raise exception 'application not found';
  end if;
  if v_body = '' then
    raise exception 'Write a message first';
  end if;
  select * into v_app from public.marketplace_applications where id = p_application;
  if v_app.status = 'withdrawn' then
    raise exception 'This application was withdrawn';
  end if;
  -- No flooding: 30 messages an hour per person per thread.
  if (select count(*) from public.marketplace_messages m
      where m.application_id = p_application and m.sender_id = auth.uid()
        and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages. Try again later.';
  end if;

  insert into public.marketplace_messages (application_id, company_id, sender_id, from_company, body)
  values (p_application, v_app.company_id, auth.uid(), v_side = 'company', v_body)
  returning * into v_row;

  select * into v_listing from public.marketplace_listings where id = v_app.listing_id;
  select * into v_company from public.companies where id = v_app.company_id;
  if v_side = 'company' then
    perform public.marketplace_notify(
      v_app.company_id, array[v_app.creator_id], 'marketplace_message',
      v_company.name, left(v_body, 140),
      'noni://creator/' || v_app.company_id || '/market/' || v_app.listing_id,
      jsonb_build_object('listing_id', v_app.listing_id, 'application_id', v_app.id)
    );
  else
    select full_name into v_name from public.profiles where id = auth.uid();
    perform public.marketplace_notify(
      v_app.company_id, public.marketplace_manager_ids(v_app.company_id), 'marketplace_message',
      coalesce(nullif(trim(v_name), ''), 'A creator'), left(v_body, 140),
      'noni://manager/' || v_app.company_id || '/market',
      jsonb_build_object('listing_id', v_app.listing_id, 'application_id', v_app.id, 'creator_id', v_app.creator_id)
    );
  end if;
  return v_row;
end;
$$;

create or replace function public.application_messages(p_application uuid)
returns table (id uuid, from_company boolean, mine boolean, body text, created_at timestamptz, read_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := public.application_side(p_application);
begin
  if v_side is null then
    raise exception 'application not found';
  end if;
  update public.marketplace_messages m
    set read_at = now()
    where m.application_id = p_application and m.read_at is null
      and m.from_company = (v_side = 'creator');
  return query
    select m.id, m.from_company, m.from_company = (v_side = 'company'), m.body, m.created_at, m.read_at
    from public.marketplace_messages m
    where m.application_id = p_application
    order by m.created_at
    limit 200;
end;
$$;

-- Unread messages from the other side, per application the caller can see.
create or replace function public.application_unread(p_applications uuid[])
returns table (application_id uuid, unread int)
language sql
stable
security definer
set search_path = public
as $$
  select m.application_id, count(*)::int
  from public.marketplace_messages m
  where m.application_id = any(p_applications)
    and m.read_at is null
    and m.from_company = (public.application_side(m.application_id) = 'creator')
    and public.application_side(m.application_id) is not null
  group by m.application_id;
$$;

revoke execute on function public.send_application_message(uuid, text) from public, anon;
revoke execute on function public.application_messages(uuid) from public, anon;
revoke execute on function public.application_unread(uuid[]) from public, anon;
grant execute on function public.send_application_message(uuid, text) to authenticated;
grant execute on function public.application_messages(uuid) to authenticated;
grant execute on function public.application_unread(uuid[]) to authenticated;
