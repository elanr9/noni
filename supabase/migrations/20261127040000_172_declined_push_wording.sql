-- 172: the declined push goes back to the wording it had before 171.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'decide_marketplace_application';
  if v_def is not null and position('See other campaigns in Market.' in v_def) > 0 then
    v_def := replace(v_def, 'v_company.name || '' declined''', 'v_company.name || '' passed this time''');
    v_def := replace(v_def, 'See other campaigns in Market.', 'Plenty more campaigns are open in the marketplace.');
    execute v_def;
  end if;
end;
$$;
