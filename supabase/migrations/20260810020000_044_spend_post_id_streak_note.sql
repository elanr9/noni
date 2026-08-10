-- Optional post_id on spend (legacy per-post bounty idempotency) + streak skip note.

drop function if exists public.spend_company_credits_for_earning(uuid, uuid, uuid, int, text);
drop function if exists public.spend_company_credits_for_earning(uuid, uuid, uuid, int, text, uuid);

create or replace function public.spend_company_credits_for_earning(
  p_company uuid,
  p_creator uuid,
  p_assignment uuid,
  p_gross_cents int,
  p_kind text,
  p_post_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_debit int;
  v_creator_net int;
  v_fee_company int;
  v_balance int;
  v_balance_after int;
  v_wallet_kind text;
  v_existing public.company_credit_ledger%rowtype;
  v_prior_wallet public.wallet_ledger%rowtype;
begin
  if p_gross_cents is null or p_gross_cents <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_gross');
  end if;
  if p_kind not in ('bounty_debit', 'streak_debit') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  end if;

  v_wallet_kind := case
    when p_kind = 'bounty_debit' then 'bounty_credit'
    else 'streak_bonus'
  end;

  if p_assignment is not null then
    select * into v_existing
    from public.company_credit_ledger
    where assignment_id = p_assignment
      and kind = p_kind
    limit 1;
    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'company_debit', abs(v_existing.amount_cents),
        'creator_net', coalesce(
          (select amount_cents from public.wallet_ledger
           where company_id = p_company
             and creator_id = p_creator
             and kind = v_wallet_kind
             and note like '%after 3% fee%'
           order by created_at desc
           limit 1),
          floor(p_gross_cents * 0.97)::int
        ),
        'balance_after', (
          select credit_balance_cents from public.company_billing
          where company_id = p_company
        )
      );
    end if;
  end if;

  if p_post_id is not null and p_kind = 'bounty_debit' then
    select * into v_prior_wallet
    from public.wallet_ledger
    where post_id = p_post_id
      and kind = 'bounty_credit'
    limit 1;
    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'company_debit', ceil(p_gross_cents * 1.10)::int,
        'creator_net', v_prior_wallet.amount_cents,
        'balance_after', (
          select credit_balance_cents from public.company_billing
          where company_id = p_company
        )
      );
    end if;
  end if;

  insert into public.company_billing (company_id)
  values (p_company)
  on conflict (company_id) do nothing;

  select credit_balance_cents into v_balance
  from public.company_billing
  where company_id = p_company
  for update;

  v_debit := ceil(p_gross_cents * 1.10)::int;
  v_creator_net := floor(p_gross_cents * 0.97)::int;
  v_fee_company := v_debit - p_gross_cents;

  if v_balance is null or v_balance < v_debit then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_credits');
  end if;

  v_balance_after := v_balance - v_debit;

  update public.company_billing
  set
    credit_balance_cents = v_balance_after,
    updated_at = now()
  where company_id = p_company;

  insert into public.company_credit_ledger (
    company_id, kind, amount_cents, gross_cents, fee_cents,
    assignment_id, creator_id, note
  ) values (
    p_company, p_kind, -v_debit, p_gross_cents, v_fee_company,
    p_assignment, p_creator,
    case
      when p_kind = 'bounty_debit' then 'Bounty debit (incl 10% company fee)'
      else 'Streak debit (incl 10% company fee)'
    end
  );

  insert into public.creator_wallets (company_id, creator_id)
  values (p_company, p_creator)
  on conflict (company_id, creator_id) do nothing;

  insert into public.wallet_ledger (
    company_id, creator_id, kind, amount_cents, post_id, note
  ) values (
    p_company, p_creator, v_wallet_kind, v_creator_net, p_post_id,
    case
      when p_kind = 'bounty_debit' then 'Bounty credit after 3% fee'
      else 'Streak bonus after 3% fee'
    end
  );

  update public.creator_wallets
  set available_cents = available_cents + v_creator_net
  where company_id = p_company and creator_id = p_creator;

  return jsonb_build_object(
    'ok', true,
    'company_debit', v_debit,
    'creator_net', v_creator_net,
    'balance_after', v_balance_after
  );
end
$fn$;

revoke execute on function public.spend_company_credits_for_earning(uuid, uuid, uuid, int, text, uuid)
  from public, anon, authenticated;
grant execute on function public.spend_company_credits_for_earning(uuid, uuid, uuid, int, text, uuid)
  to service_role;

-- Streak: keep day progress; note when wallet credit was skipped for low credits.
create or replace function public.record_streak_approval(
  p_company uuid,
  p_creator uuid,
  p_day date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_settings jsonb;
  v_day date;
  v_row public.creator_streaks%rowtype;
  v_missed int;
  v_streak int;
  v_grace_used_on date;
  v_bonus_cents int;
  v_credited_cents int := 0;
  v_spend jsonb;
  v_skip_reason text := null;
  v_milestones jsonb;
  v_item jsonb;
  v_near_days int := null;
  v_near_cents int := null;
  v_m_days int;
  v_m_cents int;
begin
  if auth.uid() is not null then
    if auth.uid() <> p_creator and not public.is_admin() then
      raise exception 'forbidden';
    end if;
    if public.current_company_id() is distinct from p_company then
      raise exception 'forbidden';
    end if;
  end if;

  select coalesce(settings, '{}'::jsonb) into v_settings
  from public.companies where id = p_company;

  v_day := coalesce(
    p_day,
    (now() at time zone coalesce(v_settings->>'timezone', 'America/Chicago'))::date
  );

  if not public.streak_day_complete(p_company, p_creator, v_day) then
    return jsonb_build_object('streak', 0, 'bonus_cents', 0, 'counted', false);
  end if;

  insert into public.creator_streaks (company_id, creator_id)
  values (p_company, p_creator)
  on conflict (company_id, creator_id) do nothing;

  select * into v_row from public.creator_streaks
  where company_id = p_company and creator_id = p_creator
  for update;

  if v_row.last_counted_date = v_day then
    return jsonb_build_object(
      'streak', v_row.current_streak,
      'bonus_cents', 0,
      'counted', false
    );
  end if;

  v_grace_used_on := v_row.grace_used_on;

  if v_row.last_counted_date is null or v_row.current_streak = 0 then
    v_streak := 1;
  else
    v_missed := public.streak_missed_days(
      p_company, p_creator, v_row.last_counted_date, v_day
    );

    if v_missed = 0 then
      v_streak := v_row.current_streak + 1;
    elsif v_missed = 1
      and (v_grace_used_on is null or v_grace_used_on < v_day - 30) then
      v_streak := v_row.current_streak + 1;
      v_grace_used_on := v_day;
    else
      v_streak := 1;
    end if;
  end if;

  update public.creator_streaks set
    current_streak = v_streak,
    longest_streak = greatest(longest_streak, v_streak),
    last_counted_date = v_day,
    grace_used_on = v_grace_used_on
  where id = v_row.id;

  v_bonus_cents := public.streak_bonus_cents(v_streak, v_settings);
  if v_bonus_cents > 0 then
    v_spend := public.spend_company_credits_for_earning(
      p_company, p_creator, null, v_bonus_cents, 'streak_debit', null
    );
    if coalesce((v_spend->>'ok')::boolean, false) then
      v_credited_cents := coalesce((v_spend->>'creator_net')::int, 0);
    else
      v_credited_cents := 0;
      v_skip_reason := v_spend->>'reason';
    end if;
  end if;

  v_milestones := coalesce(v_settings->'streak_milestones', '[]'::jsonb);
  if jsonb_typeof(v_milestones) = 'array' then
    for v_item in select jsonb_array_elements(v_milestones) loop
      v_m_days := coalesce((v_item->>'days')::int, 0);
      v_m_cents := coalesce((v_item->>'amount_cents')::int, 0);
      if v_m_days = v_streak + 1 and v_m_cents > 0 then
        v_near_days := v_m_days;
        v_near_cents := v_m_cents;
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'streak', v_streak,
    'bonus_cents', v_credited_cents,
    'gross_bonus_cents', v_bonus_cents,
    'bonus_skipped_reason', v_skip_reason,
    'counted', true,
    'near_milestone_days', v_near_days,
    'near_milestone_cents', v_near_cents
  );
end
$fn$;
