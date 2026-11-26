-- 165: a creator answers the whole apply chat before making an account.
-- The draft belongs to a guest id (a cookie the website sets) until they
-- sign in with Google; apply-chat's `claim` then moves it to their user.

alter table public.applications
  alter column user_id drop not null,
  add column if not exists guest_id uuid;

alter table public.applications
  drop constraint if exists applications_owner_check;
alter table public.applications
  add constraint applications_owner_check check (user_id is not null or guest_id is not null);

create unique index if not exists applications_guest_kind_idx
  on public.applications (guest_id, kind) where guest_id is not null;
