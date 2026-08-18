-- Mercury payouts: recipient onboarding state, payout ledger, webhook dedup.
--
-- Runs alongside Stripe Connect rather than replacing it in place. Every
-- creator_wallets row keeps stripe_connect_account_id and payout_rail defaults
-- to 'stripe', so applying this migration changes no behaviour on its own —
-- the Stripe run keeps paying everyone until rows are flipped to 'mercury'.
-- That makes the cutover a data change we can stage per creator (and revert by
-- flipping back), not a deploy we have to get right in one shot.
--
-- The existing payouts / wallet_ledger / company_payout_runs tables are left
-- untouched: mercury_payouts is a parallel record so historical Stripe payouts
-- stay readable and the two rails never contend for the same rows.

-- ---------------------------------------------------------------------------
-- creator_wallets: Mercury recipient + invite state.

alter table public.creator_wallets
  -- Mercury TransactionPartyId is documented `format: uuid`, so uuid is safe.
  add column if not exists mercury_recipient_id uuid,

  -- NOT uuid. Mercury's RecipientInviteId is a bare `type: string` and
  -- RecipientInfo.inviteId is a Slug — neither is documented as a uuid, so a
  -- uuid column would reject the first real invite id with 22P02.
  add column if not exists mercury_invite_id text,

  add column if not exists mercury_invite_status text not null default 'none'
    constraint creator_wallets_mercury_invite_status_check
    check (mercury_invite_status in ('none', 'created', 'completed', 'expired')),

  -- Held server-side only. The onboarding link is emailed to the creator; it is
  -- never returned to the app, so a stolen session cannot claim a payout
  -- identity by reading it back out.
  add column if not exists mercury_onboarding_url text,

  add column if not exists mercury_w9_status text not null default 'none'
    constraint creator_wallets_mercury_w9_status_check
    check (mercury_w9_status in ('none', 'submitted', 'unknown')),

  add column if not exists mercury_invite_sent_at timestamptz,
  add column if not exists mercury_invite_reminder_sent_at timestamptz,
  add column if not exists mercury_onboarded_at timestamptz,

  -- Gate for the weekly run. Only set true once Mercury reports the invite
  -- completed, so an in-flight onboarding can never be paid.
  add column if not exists payout_ready boolean not null default false,

  add column if not exists payout_rail text not null default 'stripe'
    constraint creator_wallets_payout_rail_check
    check (payout_rail in ('stripe', 'mercury', 'none'));

comment on column public.creator_wallets.mercury_invite_id is
  'Mercury RecipientInviteId. Text, not uuid: the Mercury API documents this as a plain string (Slug), never as format: uuid.';

comment on column public.creator_wallets.payout_rail is
  'Which rail pays this creator. Defaults to stripe so this migration is inert until rows are flipped to mercury. Set none to suspend payouts without deleting the wallet.';

comment on column public.creator_wallets.mercury_w9_status is
  'submitted when a Mercury recipient attachment reports formType=w9; unknown when an attachment exists but Mercury could not classify it. Mercury exposes no review/verified state, so this records presence only.';

-- Sweep joins completed invites back to wallets by invite id.
create unique index if not exists creator_wallets_mercury_invite_idx
  on public.creator_wallets (mercury_invite_id)
  where mercury_invite_id is not null;

-- Payable set for the Sunday run.
create index if not exists creator_wallets_mercury_payable_idx
  on public.creator_wallets (company_id)
  where payout_ready and payout_rail = 'mercury' and available_cents > 0;

-- Reminder scan: invites still outstanding after 3 days.
create index if not exists creator_wallets_mercury_pending_invite_idx
  on public.creator_wallets (mercury_invite_sent_at)
  where mercury_invite_status = 'created' and mercury_invite_reminder_sent_at is null;

-- ---------------------------------------------------------------------------
-- mercury_payouts: one row per creator per payout period.

create table public.mercury_payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies,
  creator_id uuid not null references public.profiles,
  amount_cents int not null check (amount_cents > 0),

  -- sha256(creator_id + company_id + period_end), sent to Mercury in the
  -- request body. Unique here so a retried or concurrent run collides on
  -- insert (23505) before any money moves, rather than relying on Mercury's
  -- undocumented replay behaviour.
  idempotency_key text not null unique,

  -- Mercury has no cancel endpoint, so the row is written as 'scheduled'
  -- before the send and only advances once Mercury has answered. A crash
  -- between insert and response leaves a 'sending' row to reconcile, never a
  -- silent double payment.
  mercury_transaction_id text,
  status text not null default 'scheduled'
    constraint mercury_payouts_status_check
    check (status in ('scheduled', 'sending', 'sent', 'failed', 'reversed')),

  period_start date not null,
  period_end date not null,
  failure_reason text,

  created_at timestamptz not null default now(),
  sent_at timestamptz,
  settled_at timestamptz
);

comment on table public.mercury_payouts is
  'Mercury payout attempts. Parallel to public.payouts (Stripe) — historical Stripe rows stay in payouts and are not migrated.';

comment on column public.mercury_payouts.status is
  'scheduled: row written, Mercury not yet called. sending: Mercury accepted, settlement pending. sent/failed/reversed: terminal, set by the webhook.';

create index mercury_payouts_creator_created_idx
  on public.mercury_payouts (creator_id, created_at desc);

-- Webhook lookup path: resourceId -> payout.
create index mercury_payouts_transaction_idx
  on public.mercury_payouts (mercury_transaction_id)
  where mercury_transaction_id is not null;

-- Reconciliation: find sends that never settled.
create index mercury_payouts_unsettled_idx
  on public.mercury_payouts (created_at)
  where status in ('scheduled', 'sending');

-- ---------------------------------------------------------------------------
-- mercury_webhook_events: at-least-once delivery dedup.

create table public.mercury_webhook_events (
  -- Mercury's event id. Text rather than uuid: the id is only ever echoed back
  -- for dedup, and a format change upstream should not 500 the receiver.
  id text primary key,
  resource_type text,
  resource_id text,
  operation_type text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.mercury_webhook_events is
  'Dedup ledger for Mercury webhooks. Mercury delivers at-least-once and retries up to 10 times over ~1 day; insert conflict on id means already seen. processed_at null means received but processing did not finish — safe to replay.';

create index mercury_webhook_events_resource_idx
  on public.mercury_webhook_events (resource_id);

create index mercury_webhook_events_unprocessed_idx
  on public.mercury_webhook_events (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- RLS.

alter table public.mercury_payouts enable row level security;
alter table public.mercury_webhook_events enable row level security;

-- mercury_payouts mirrors the public.payouts policies from 011 exactly.
create policy "admins read mercury payouts" on public.mercury_payouts for select
  using (company_id = public.current_company_id() and public.is_admin());

create policy "creators read own mercury payouts" on public.mercury_payouts for select
  using (
    company_id = public.current_company_id()
    and creator_id = auth.uid()
  );

create policy "admins write mercury payouts" on public.mercury_payouts for all
  using (company_id = public.current_company_id() and public.is_admin());

-- mercury_webhook_events is service_role only: RLS on with no policies denies
-- anon and authenticated outright, and service_role bypasses RLS.

grant select, insert, update, delete on public.mercury_payouts to anon, authenticated, service_role;
grant select, insert, update, delete on public.mercury_webhook_events to service_role;
