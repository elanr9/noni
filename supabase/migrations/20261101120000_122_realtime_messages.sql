-- Messages tabs (v2): the open thread subscribes to inserts on the two
-- message tables over Realtime instead of polling. RLS still decides which
-- rows reach each client; the publication only makes the changes available.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'manager_messages'
  ) then
    alter publication supabase_realtime add table public.manager_messages;
  end if;
end $$;
