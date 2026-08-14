-- Publish assignments to realtime so status changes (approve, changes
-- requested, posted) reach the creator app live (flow F5). RLS still governs
-- which rows each client can see.
alter publication supabase_realtime add table public.assignments;
