-- 174: no fee on creator pay (owner decision 2026-11-27).
--
-- The budget pays creators exactly what they earn; Noni makes its money from
-- subscriptions only. Migration 144 added 13% on top of every dollar of
-- creator pay. That is gone: a company is debited the creator's pay and
-- nothing more.

create or replace function public.creator_pay_rates()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'video_post_cents', 1000,
    'static_post_cents', 500,
    'cents_per_1k_views', 100,
    'view_pay_cap_cents', 30000,
    'min_views', 500,
    'view_window_days', 30,
    'noni_fee_bps', 0
  )
$$;

-- The budget ledger notes no longer mention a fee.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'pay_assignment';
  if v_def is not null and position(' (creator pay + 13% fee)' in v_def) > 0 then
    v_def := replace(v_def, E'\n          || '' (creator pay + 13% fee)''', '');
    v_def := replace(v_def, ' || '' (creator pay + 13% fee)''', '');
    execute v_def;
  end if;
end;
$$;
