# Mercury payouts — setup and cutover

How to take Noni's creator payouts from Stripe Connect to Mercury.

Read the whole page before starting. **Step 5 stops Stripe payouts the moment it
lands**, and steps 1–4 are prerequisites that cannot be done afterwards without
a gap in which nobody can be paid.

---

## What gets deployed

| Piece | Where | Holds |
|---|---|---|
| `mercury-proxy` | EC2 `t4g.nano` behind an Elastic IP | The Mercury **write token** — the only place it exists |
| `mercury-*` edge functions | Supabase Edge Functions | Business logic, proxy shared secret, webhook secret |
| Migrations 066–068 | Supabase Postgres | Schema, ledger link, cron schedule |

Mercury requires an IP whitelist on any Read-and-Write token, and Supabase Edge
Functions have no static egress IP. That is the entire reason the proxy exists.

---

## Environment variables

### On EC2 — `/etc/mercury-proxy.env` (root-owned, `chmod 600`)

| Variable | Required | Notes |
|---|---|---|
| `MERCURY_API_TOKEN` | ✅ | Read-and-Write token, including the `secret-token:` prefix. **Never** put this in Supabase or the app. |
| `PROXY_SHARED_SECRET` | ✅ | ≥ 32 chars. `openssl rand -hex 32`. The server refuses to start below 32. |
| `MERCURY_ACCOUNT_ID` | — | Fallback account uuid; edge functions pass it per request. |
| `MERCURY_BASE_URL` | — | Defaults to production. Set to `https://api-sandbox.mercury.com/api/v1` for sandbox. |
| `SEND_LIMIT_PER_MIN` | — | Default 120. Backstop against a runaway payout loop. |
| `UPSTREAM_TIMEOUT_MS` | — | Default 20000. |

### In Supabase — Dashboard → Edge Functions → Secrets

| Variable | Required | Notes |
|---|---|---|
| `MERCURY_PROXY_URL` | ✅ | `https://mercury-proxy.<your-domain>`. Must be **https and a hostname** — a bare IP is rejected at call time. |
| `MERCURY_PROXY_SECRET` | ✅ | Must equal `PROXY_SHARED_SECRET` on EC2. |
| `MERCURY_ACCOUNT_ID` | ✅ | uuid of the Mercury account payouts are sent from. |
| `MERCURY_WEBHOOK_SECRET` | ✅ | Returned **only** when the webhook is created (step 4). Capture it then or recreate the endpoint. |
| `MERCURY_PAYOUTS_ENABLED` | ✅ | Master kill switch. Exactly `'true'` arms the Sunday run. Anything else — including `TRUE` or `True` — stays dormant. |
| `CRON_SECRET` | already set | Must match the Vault `cron_secret`. |
| `RESEND_API_KEY`, `INVITE_FROM_EMAIL` | already set | Onboarding and reminder emails. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | automatic | Injected by the platform. |

⚠️ **Never** put any Mercury value in an `EXPO_PUBLIC_*` variable — those are
inlined into the app bundle at build time and shipped to every device.

### In Supabase Vault — already configured

`cron_secret`, read by the pg_cron jobs and matched against `CRON_SECRET`.
Nothing new to add; migration 068 reuses it.

---

## Deploy order

The order matters. Each step is a prerequisite of the next.

### 1. Deploy the EC2 proxy and whitelist the Elastic IP

```bash
cd mercury-proxy/deploy
./deploy.sh mercury-proxy.<your-domain> ops@<your-domain>
```

Then, on the box, fill in `/etc/mercury-proxy.env` and restart
(`sudo systemctl restart mercury-proxy`). Verify the outbound IP:

```bash
curl -s https://mercury-proxy.<your-domain>/healthz | jq
# { "ok": true, "ip": "<EIP>", ... }   <-- ip MUST equal the Elastic IP
```

Whitelist that IP: **Mercury dashboard → Settings → API Tokens → your
Read-and-Write token → IP whitelist.** Full detail in
[mercury-proxy/README.md](mercury-proxy/README.md).

The Elastic IP belongs to your AWS account and survives instance replacement, so
this whitelisting is a one-time step.

### 2. Set every Supabase edge function secret

All of the table above **except** `MERCURY_WEBHOOK_SECRET`, which does not exist
yet. Set `MERCURY_PAYOUTS_ENABLED` to `false` for now — it is armed last.

### 3. Deploy the edge functions

```bash
supabase functions deploy mercury-create-invite     --use-api
supabase functions deploy mercury-verify-onboarding --use-api
supabase functions deploy mercury-onboarding-sweep  --use-api
supabase functions deploy mercury-weekly-payouts    --use-api
supabase functions deploy mercury-webhook           --use-api
supabase functions deploy mercury-token-liveness    --use-api
```

Must happen **before** step 5. Migration 068 schedules cron jobs that POST to
these URLs; if the functions are not deployed the schedule 404s on its first
firing.

`supabase/config.toml` carries the `verify_jwt = false` settings for
`mercury-webhook` and the three cron-triggered functions. `mercury-create-invite`
and `mercury-verify-onboarding` intentionally keep the default JWT check.

### 4. Register the Mercury webhook and capture its secret

```bash
curl -X POST https://api.mercury.com/api/v1/webhooks \
  -H "Authorization: Bearer $MERCURY_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/mercury-webhook",
    "eventTypes": ["transaction.created", "transaction.updated"],
    "filterPaths": ["transaction.status"]
  }'
```

> 🔑 **The `secret` field comes back only on this create call.** It is not
> returned by any GET or update. Copy it immediately into
> `MERCURY_WEBHOOK_SECRET`. If you lose it, delete the endpoint and register a
> new one.

Run this from the **whitelisted EC2 box** (or any whitelisted address) — it is a
write call against a Read-and-Write token.

`filterPaths` narrows delivery to status changes. Without it every note,
category and memo edit on any transaction in the account hits the endpoint.

Verify reachability before moving on:

```bash
curl -X POST https://api.mercury.com/api/v1/webhooks/<webhook-id>/verify \
  -H "Authorization: Bearer $MERCURY_API_TOKEN" \
  -H 'Content-Type: application/json' -d '{"eventType":"transaction.updated"}'
```

Then set `MERCURY_WEBHOOK_SECRET` in Supabase and **redeploy `mercury-webhook`**
so it picks the value up.

### 5. Apply the migrations, in order

```bash
npx tsx scripts/apply-migration.ts supabase/migrations/20260817000000_066_mercury_payouts.sql
npx tsx scripts/apply-migration.ts supabase/migrations/20260817010000_067_wallet_ledger_mercury_link.sql
npx tsx scripts/apply-migration.ts supabase/migrations/20260817020000_068_mercury_cron.sql
```

- **066** adds the Mercury columns, `mercury_payouts`, `mercury_webhook_events`.
  Inert on its own: every wallet stays `payout_rail = 'stripe'`.
- **067** adds `wallet_ledger.mercury_payout_id`. Required — without it every
  payout fails on a foreign key violation.
- **068** ⚠️ **unschedules the Stripe payout cron.** See the cutover warning below.

`apply-migration.ts` also regenerates `lib/types.ts`, so the new tables and
columns become available to the app's typed Supabase client — which Phase 7
needs for the payout-setup screens. Commit the regenerated file.

### 6. Smoke test end to end

One real creator, one \$1 payout, before anything is armed. Procedure in
`TESTING_MERCURY.md`. At minimum confirm: invite email arrives → onboarding
completes → `payout_ready` flips → a forced \$1 run sends → the webhook fires →
`available_cents` decrements.

Force a run without waiting for Sunday:

```bash
curl -X POST https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/mercury-weekly-payouts \
  -H "x-cron-secret: $CRON_SECRET" -H 'Content-Type: application/json' \
  -d '{"force": true, "company_id": "<test-company-uuid>"}'
```

`force` bypasses the Sunday-evening window. It does **not** bypass
`MERCURY_PAYOUTS_ENABLED`, so arm the flag temporarily for the smoke test and
turn it back off until you have verified the result.

### 7. Arm the kill switch

Only after step 6 verifies clean:

```
MERCURY_PAYOUTS_ENABLED = true
```

Exactly `true`, lowercase. This is the single action that takes payouts live —
and the fastest way to stop them again.

---

## ⚠️ Cutover window

**Applying 068 stops Stripe payouts immediately.** `noni-weekly-payouts` is
unscheduled the instant the migration lands, and Mercury stays dormant until
step 7. Between those two moments, no rail is paying.

**Plan the deploy for a Monday–Friday.** If a Sunday 20:00 ET falls inside the
gap, that week's run simply does not happen. Nothing is lost — `available_cents`
is untouched and balances carry to the next Sunday — but creators expecting
money that evening will not get it.

Two further ordering constraints:

- Creators are only paid on the Mercury rail once `payout_rail = 'mercury'`,
  which is set when they complete onboarding. **Creators who have not onboarded
  to Mercury will not be paid by either rail** once 068 lands. Get the invite
  flow live and let creators onboard *before* cutting over, or accept a gap for
  the stragglers.
- The `mercury-onboarding-sweep` runs Saturday 15:00 ET, the day before payouts,
  so anyone who finished onboarding but never tapped "I'm done" is picked up in
  time to be paid that week.

---

## Rollback

Nothing is deleted, so reverting is quick.

**Stop Mercury payouts immediately:** set `MERCURY_PAYOUTS_ENABLED` to `false`.
Takes effect on the next hourly firing; no deploy needed.

**Restore Stripe payouts:**

```sql
select cron.schedule(
  'noni-weekly-payouts',
  '10 * * * *',
  $$
  select net.http_post(
    url := 'https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/weekly-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

The Stripe functions and `stripe_connect_account_id` are untouched by 066–068.
Move individual creators back with
`update creator_wallets set payout_rail = 'stripe' where …`.

**Suspend one creator without deleting anything:**
`update creator_wallets set payout_rail = 'none' where creator_id = …`.

---

## Post-deploy checks

| Check | How |
|---|---|
| Cron jobs registered | `select jobname, schedule, active from cron.job where jobname like 'noni-mercury%';` |
| Stripe cron gone | `select count(*) from cron.job where jobname = 'noni-weekly-payouts';` → `0` |
| Proxy healthy, IP correct | `curl -s https://mercury-proxy.<domain>/healthz \| jq` |
| Token alive and whitelisted | Monday logs from `mercury-token-liveness`; a 401/403 there means act now |
| Payouts stuck in flight | `select * from mercury_payouts where status in ('scheduled','sending') and created_at < now() - interval '3 days';` |
| Webhooks arriving but not processed | `select * from mercury_webhook_events where processed_at is null;` |
| Ledger invariant intact | the drift query in [NOTES.md](NOTES.md) — expect **no** rows for Mercury-rail creators |

Anything flagged `UNRESOLVED` in `mercury_payouts.failure_reason` means a send
whose outcome is genuinely unknown: the hold is deliberately left in place so
next week cannot pay it again. **Verify against the Mercury dashboard before
touching those rows.**
