-- Restore Supabase default table grants. DML on public tables was revoked
-- outside migrations, breaking all PostgREST access (42501). RLS remains
-- the access gate; these grants match a stock Supabase project.

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;
