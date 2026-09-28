-- Recurring creator warm-up push. notify-reminders sends it at 2 PM
-- America/New_York every 3 days starting 2026-09-28.

alter table public.creator_reminders drop constraint if exists creator_reminders_kind_check;
alter table public.creator_reminders
  add constraint creator_reminders_kind_check
  check (kind in ('due_today', 'overdue', 'creator_behind', 'account_warmup'));
