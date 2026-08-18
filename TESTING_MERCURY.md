# Mercury payouts — test and cutover checklist

Walk this top to bottom on cutover day. Every box is a real action with an
expected result; if a result does not match, stop rather than continue.

Setup and deploy order live in [SETUP_MERCURY.md](SETUP_MERCURY.md). This
document assumes everything there is done through step 5.

**Do not skip §4.** Rehearsing rollback before you need it is the whole point.

---

## Conventions

Shell variables used throughout:

```bash
export PROJECT_REF=zdcmmzofnrdqbwexuqnm
export FN=https://$PROJECT_REF.supabase.co/functions/v1
export CRON_SECRET=...            # matches the Vault cron_secret
export PROXY=https://mercury-proxy.<your-domain>
export PROXY_SECRET=...           # PROXY_SHARED_SECRET from /etc/mercury-proxy.env
export TEST_CREATOR=<uuid>        # a real creator profile you control
export TEST_COMPANY=<uuid>
```

SQL runs through the Management API pattern in
[SUPABASE_ACCESS.md](SUPABASE_ACCESS.md). A helper:

```bash
sql() { set -a && source .env.local && set +a
  curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json" \
    -H "User-Agent: supabase-cli/2.75.0" -d "{\"query\":$(jq -Rs . <<<"$1")}"; }
```

**The invariant check**, referenced repeatedly below:

```bash
sql "select w.creator_id, w.available_cents, w.pending_cents,
            coalesce(sum(l.amount_cents),0) as ledger_sum,
            w.available_cents - coalesce(sum(l.amount_cents),0) as drift
     from creator_wallets w
     left join wallet_ledger l on l.creator_id = w.creator_id and l.company_id = w.company_id
     where w.payout_rail = 'mercury'
     group by w.creator_id, w.available_cents, w.pending_cents
     having w.available_cents <> coalesce(sum(l.amount_cents),0);"
```

**Zero rows = healthy.** Any row is a real accounting bug — stop and
investigate. (Stripe-rail creators are excluded on purpose: they carry known
pre-existing drift, see [NOTES.md](NOTES.md) §2.)

---

## 1. Sandbox pass

> ### ⚠️ What sandbox cannot test
>
> **Webhooks are not supported in the Mercury sandbox.** Mercury states this
> outright in its webhooks documentation.
>
> That means the **entire settlement path is untestable here**:
>
> - `transaction.updated` never arrives
> - `mercury_payouts` never advances past `sending`
> - `available_cents` is never decremented on success
> - `pending_cents` is never cleared
> - the `failed` / `reversed` restore path never runs
>
> Sandbox proves invite → onboarding → send. **Settlement is first exercised in
> production, in §2.** Plan for that: the $1 smoke test is not a formality, it is
> the first and only end-to-end proof the money path closes.
>
> Also unavailable in sandbox: real ACH movement, and any Mercury behaviour that
> depends on a funded account.

### 1.1 Point the proxy at sandbox

- [ ] Sign up at <https://sandbox.mercury.com/signup> and create an API token
      **inside sandbox** (production tokens do not work against sandbox, and
      vice versa)
- [ ] Whitelist the Elastic IP on the sandbox token
- [ ] On the EC2 box, edit `/etc/mercury-proxy.env`:
      ```ini
      MERCURY_BASE_URL=https://api-sandbox.mercury.com/api/v1
      MERCURY_API_TOKEN=<sandbox token>
      ```
- [ ] `sudo systemctl restart mercury-proxy`
- [ ] `curl -s $PROXY/healthz | jq` → `ok: true`, `ip` equals the Elastic IP

### 1.2 Proxy reaches Mercury

- [ ] Auth is enforced — no secret is rejected:
      ```bash
      curl -s -o /dev/null -w '%{http_code}\n' -X POST $PROXY/invite \
        -H 'content-type: application/json' -d '{}'
      ```
      **Expect `401`.**
- [ ] Token is live — unknown recipient returns a clean 404:
      ```bash
      curl -s -o /dev/null -w '%{http_code}\n' \
        "$PROXY/recipient/00000000-0000-0000-0000-000000000000" \
        -H "x-proxy-secret: $PROXY_SECRET"
      ```
      **Expect `404`.** A `401`/`403` means the token or IP whitelist is wrong.

### 1.3 Invite flow

- [ ] In the app as the test creator: Balance → **Set up payouts**
- [ ] Onboarding email arrives from `INVITE_FROM_EMAIL`
- [ ] The email body contains a Mercury onboarding link
- [ ] Wallet row recorded it:
      ```bash
      sql "select mercury_invite_id, mercury_invite_status, mercury_invite_sent_at,
                  payout_ready, payout_rail
           from creator_wallets where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** `mercury_invite_status = created`, `payout_ready = false`,
      `payout_rail` still `stripe`.
- [ ] `mercury_invite_id` is **not** a uuid — Mercury invite ids are plain
      strings. If it looks like `xxxxxxxx-xxxx-…`, that is fine too, but the
      column is `text` precisely because it usually is not.
- [ ] App shows the **Check your email** state with an **I'm done setting up**
      button
- [ ] Tap **I'm done setting up** *before* completing the form →
      **Expect** `We don't see your info yet, double check the link in your email`

### 1.4 Complete onboarding

- [ ] Open the emailed link, complete Mercury onboarding, upload a W-9
- [ ] Back in the app, tap **I'm done setting up**
- [ ] **Expect** `You're all set. Payouts run Sunday evenings.`
- [ ] Verify:
      ```bash
      sql "select mercury_invite_status, mercury_recipient_id, mercury_w9_status,
                  payout_ready, payout_rail, mercury_onboarded_at,
                  mercury_onboarding_url
           from creator_wallets where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** `completed`, a recipient uuid, `w9_status = submitted`,
      `payout_ready = true`, `payout_rail = mercury`, and
      `mercury_onboarding_url = NULL` (the spent link is cleared).
- [ ] The setup checklist step reads **done**, and the creator is not gated out
      of the app

### 1.5 Send path (settlement will NOT complete — see the warning above)

- [ ] Seed a test balance **with a ledger row**, so the invariant stays true:
      ```bash
      sql "insert into wallet_ledger (company_id, creator_id, kind, amount_cents, note)
           values ('$TEST_COMPANY','$TEST_CREATOR','adjustment',100,'sandbox smoke test');
           update creator_wallets set available_cents = available_cents + 100
           where creator_id = '$TEST_CREATOR';"
      ```
      ⚠️ Never bump `available_cents` without the matching ledger row — that
      alone breaks the invariant and invalidates every check below.
- [ ] Arm and force a run:
      ```bash
      # MERCURY_PAYOUTS_ENABLED must be 'true' — force does NOT bypass it
      curl -s -X POST $FN/mercury-weekly-payouts \
        -H "x-cron-secret: $CRON_SECRET" -H 'content-type: application/json' \
        -d "{\"force\": true, \"company_id\": \"$TEST_COMPANY\"}" | jq
      ```
      **Expect** `creators_paid: 1`, `sent_cents: 100`.
- [ ] ```bash
      sql "select status, amount_cents, mercury_transaction_id, idempotency_key,
                  period_start, period_end, sent_at
           from mercury_payouts where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** `status = sending`, a transaction id, a 64-char hex key.
- [ ] Hold written, money moved out of available:
      ```bash
      sql "select kind, amount_cents, mercury_payout_id from wallet_ledger
           where creator_id = '$TEST_CREATOR' order by created_at desc limit 3;"
      ```
      **Expect** a `payout_hold` of `-100` linked to the payout.
- [ ] Run the invariant check → **zero rows**
- [ ] **Idempotency:** force the same run again →
      **Expect** `skipped: already attempted for this period`, and still exactly
      one `mercury_payouts` row. Nothing sent twice.
- [ ] Confirm the send is visible in the Mercury sandbox UI
- [ ] ⚠️ `status` stays `sending` forever in sandbox. **This is expected.** There
      is no webhook to advance it.

### 1.6 Sandbox teardown

- [ ] Reverse the test state:
      ```bash
      sql "delete from wallet_ledger where creator_id = '$TEST_CREATOR'
             and note = 'sandbox smoke test';
           delete from mercury_payouts where creator_id = '$TEST_CREATOR';
           update creator_wallets
             set available_cents = 0, pending_cents = 0,
                 payout_ready = false, payout_rail = 'stripe',
                 mercury_invite_id = null, mercury_invite_status = 'none',
                 mercury_recipient_id = null, mercury_w9_status = 'none',
                 mercury_onboarded_at = null, mercury_invite_sent_at = null,
                 mercury_invite_reminder_sent_at = null
           where creator_id = '$TEST_CREATOR';"
      ```
      ⚠️ Delete the `wallet_ledger` hold row too — otherwise it stays linked to
      a deleted payout and the invariant check reports drift forever.
- [ ] Point the proxy back at production: remove `MERCURY_BASE_URL`, restore the
      production `MERCURY_API_TOKEN`, `sudo systemctl restart mercury-proxy`
- [ ] `curl -s $PROXY/healthz | jq` → healthy

---

## 2. Production smoke test

Real money. One dollar. Do this **before** arming the kill switch for everyone.

- [ ] `MERCURY_PAYOUTS_ENABLED = true` (temporarily)
- [ ] Confirm the proxy is on production Mercury:
      ```bash
      curl -s -o /dev/null -w '%{http_code}\n' \
        "$PROXY/recipient/00000000-0000-0000-0000-000000000000" \
        -H "x-proxy-secret: $PROXY_SECRET"
      ```
      **Expect `404`** against the production token.
- [ ] Complete §1.3–1.4 again with **your own** creator account and a real bank
      account and W-9
- [ ] Seed exactly \$1, with the ledger row:
      ```bash
      sql "insert into wallet_ledger (company_id, creator_id, kind, amount_cents, note)
           values ('$TEST_COMPANY','$TEST_CREATOR','adjustment',100,'prod smoke test');
           update creator_wallets set available_cents = available_cents + 100
           where creator_id = '$TEST_CREATOR';"
      ```
- [ ] Force the run (as in §1.5) → **Expect** `creators_paid: 1`
- [ ] `mercury_payouts.status = sending`, transaction id recorded
- [ ] The payment appears in the Mercury dashboard

### 2.1 Settlement — the part sandbox could not prove

- [ ] Webhook was received and deduplicated:
      ```bash
      sql "select id, resource_type, operation_type, received_at, processed_at
           from mercury_webhook_events order by received_at desc limit 5;"
      ```
      **Expect** rows with `processed_at` **not null**. A null `processed_at`
      means delivery succeeded but processing failed — check the function logs.
- [ ] Payout settled (ACH takes 1–3 business days):
      ```bash
      sql "select status, settled_at, failure_reason
           from mercury_payouts where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** `status = sent`, `settled_at` set, `failure_reason` null.
- [ ] Balances moved correctly:
      ```bash
      sql "select available_cents, pending_cents from creator_wallets
           where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** `pending_cents` back to 0. `available_cents` was decremented at
      send time, not at settlement.
- [ ] **Exactly one debit row exists** — there must be no `payout_paid` row:
      ```bash
      sql "select kind, amount_cents from wallet_ledger
           where creator_id = '$TEST_CREATOR' order by created_at desc limit 5;"
      ```
      **Expect** one `payout_hold -100` and **no** `payout_paid`. A second
      negative row would mean the creator was debited twice.
- [ ] Run the invariant check → **zero rows**
- [ ] In the app, the ledger row now reads **"Cash out paid"** — not "Cash out
      hold" and not amber "pending"
- [ ] \$1 actually landed in the bank account
- [ ] Set `MERCURY_PAYOUTS_ENABLED = false` again until you are ready to go live
- [ ] Clean up the seeded dollar if you want the balance flat (leave the real
      payout rows — they are genuine history)

---

## 3. Failure drills

Run these against a **test creator with a tiny balance**, never a real one. Each
drill ends with a restore step; complete it before starting the next.

### 3.1 Token downgrade / rejection (the 45-day rule)

Mercury downgrades a token whose permissions exceed its usage over any 45-day
window and deletes one unused for 45 days. **A downgrade cannot be undone** — you
must mint a new token and re-whitelist.

- [ ] Simulate: put a deliberately invalid token in `/etc/mercury-proxy.env`,
      `sudo systemctl restart mercury-proxy`
- [ ] ```bash
      curl -s -X POST $FN/mercury-token-liveness \
        -H "x-cron-secret: $CRON_SECRET" -d '{}' | jq
      ```
      **Expect** `ok: false`, `status: 401`, and the message about checking the
      token and IP whitelist. **HTTP 200** — deliberate, so `pg_net` does not
      retry; the alarm is in the logs.
- [ ] Confirm the log line `mercury-token-liveness TOKEN REJECTED` is present
- [ ] Restore the real token, restart, re-run → `ok: true`, `probe: "404"`
- [ ] Confirm the weekly cron is scheduled so this runs unattended:
      ```bash
      sql "select jobname, schedule, active from cron.job
           where jobname = 'noni-mercury-token-liveness';"
      ```
      **Expect** `0 12 * * 1`, active.

> **If this fires for real:** mint a new Read-and-Write token in the Mercury
> dashboard, whitelist the same Elastic IP, update `/etc/mercury-proxy.env`,
> restart. No Supabase or app change needed.

### 3.2 Webhook signature failure

- [ ] Unsigned request is rejected:
      ```bash
      curl -s -o /dev/null -w '%{http_code}\n' -X POST $FN/mercury-webhook \
        -H 'content-type: application/json' -d '{"id":"evt_test"}'
      ```
      **Expect `400`** (`bad signature header`).
- [ ] Malformed signature does **not** 500:
      ```bash
      curl -s -X POST $FN/mercury-webhook \
        -H 'Mercury-Signature: t=1,v1=abc' \
        -H 'content-type: application/json' -d '{"id":"evt_test"}'
      ```
      **Expect `400`**, never `500`. A 500 would make Mercury retry for a day.
- [ ] Stale timestamp is rejected:
      ```bash
      curl -s -X POST $FN/mercury-webhook \
        -H "Mercury-Signature: t=1000000000,v1=$(printf 'ab%.0s' {1..32})" \
        -H 'content-type: application/json' -d '{"id":"evt_test"}'
      ```
      **Expect `400`** (`signature timestamp out of tolerance`, 5-minute window).
- [ ] Confirm **no** row was written for `evt_test`:
      ```bash
      sql "select count(*) from mercury_webhook_events where id = 'evt_test';"
      ```
      **Expect `0`.** Nothing is recorded before the signature verifies.
- [ ] Real delivery still works — re-run Mercury's verify:
      ```bash
      curl -X POST https://api.mercury.com/api/v1/webhooks/<webhook-id>/verify \
        -H "Authorization: Bearer $MERCURY_API_TOKEN" \
        -H 'content-type: application/json' -d '{"eventType":"transaction.updated"}'
      ```

> **If signatures fail for real:** the usual cause is a rotated endpoint secret.
> `MERCURY_WEBHOOK_SECRET` is returned **only** at webhook creation — if it was
> lost, delete the endpoint, create a new one, capture the secret, and redeploy
> `mercury-webhook`.

### 3.3 Proxy down at 8pm Sunday

The drill that matters most. **Expected behaviour: the hold stands and the
payout is left for a human — it is not silently reversed.**

- [ ] Seed \$1 on the test creator (with a ledger row, as in §1.5)
- [ ] `sudo systemctl stop mercury-proxy`
- [ ] Force a run → **Expect** the creator listed under `needs_reconciliation`,
      not `rejected`
- [ ] ```bash
      sql "select status, failure_reason, mercury_transaction_id
           from mercury_payouts where creator_id = '$TEST_CREATOR'
           order by created_at desc limit 1;"
      ```
      **Expect** `status = scheduled`, `mercury_transaction_id` null, and
      `failure_reason` starting **`UNRESOLVED — verify in Mercury before
      acting`**.
- [ ] The hold is still in place — money did **not** bounce back:
      ```bash
      sql "select available_cents, pending_cents from creator_wallets
           where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** `available_cents` reduced, `pending_cents` raised. This is what
      stops next week's run from paying the same money again.
- [ ] Run the invariant check → **zero rows** (the hold is balanced)
- [ ] It surfaces in the reconciliation query:
      ```bash
      sql "select * from mercury_payouts
           where status in ('scheduled','sending')
             and created_at < now() - interval '1 hour';"
      ```
- [ ] `sudo systemctl start mercury-proxy`, `curl -s $PROXY/healthz | jq`
- [ ] **Reconcile by hand.** Check the Mercury dashboard for a payment matching
      the amount and date:
      - **Nothing there** → nothing was sent. Reverse the hold:
        ```bash
        sql "insert into wallet_ledger (company_id, creator_id, kind, amount_cents, mercury_payout_id, note)
             select company_id, creator_id, 'payout_failed', amount_cents, id, 'manual reversal: send never reached Mercury'
             from mercury_payouts where id = '<payout-id>';
             update creator_wallets w set available_cents = w.available_cents + p.amount_cents,
                    pending_cents = greatest(0, w.pending_cents - p.amount_cents)
             from mercury_payouts p where p.id = '<payout-id>' and w.creator_id = p.creator_id;
             update mercury_payouts set status = 'failed',
                    failure_reason = 'manual: send never reached Mercury'
             where id = '<payout-id>';"
        ```
      - **Payment is there** → set `mercury_transaction_id` from the dashboard
        and let the webhook settle it:
        ```bash
        sql "update mercury_payouts set status = 'sending',
                    mercury_transaction_id = '<txn-id-from-dashboard>'
             where id = '<payout-id>';"
        ```
- [ ] Run the invariant check → **zero rows**

> Never blanket-reverse an `UNRESOLVED` payout without checking Mercury first.
> Mercury has no cancel endpoint and no lookup-by-idempotency-key, so the
> dashboard is the only source of truth.

### 3.4 EC2 instance replaced (Elastic IP survives)

- [ ] Note the current EIP: `curl -s $PROXY/healthz | jq -r .ip`
- [ ] Stop the instance:
      ```bash
      aws ec2 stop-instances --instance-ids <id>
      aws ec2 wait instance-stopped --instance-ids <id>
      ```
- [ ] Confirm the proxy is unreachable and the payout run degrades safely —
      force a run and check it reports `needs_reconciliation`, exactly as §3.3
- [ ] Start the instance again:
      ```bash
      aws ec2 start-instances --instance-ids <id>
      aws ec2 wait instance-running --instance-ids <id>
      ```
- [ ] ```bash
      aws ec2 describe-addresses --filters "Name=tag:Project,Values=noni-mercury-proxy" \
        --query 'Addresses[0].[PublicIp,InstanceId]' --output text
      ```
      **Expect the same public IP**, still associated.
- [ ] `curl -s $PROXY/healthz | jq` → same `ip` as before
- [ ] **No Mercury re-whitelisting required.** The Elastic IP is allocated to
      your AWS account, not the instance.
- [ ] If you replace the instance entirely, re-associate the *same* allocation:
      ```bash
      aws ec2 associate-address --instance-id <new-id> --allocation-id <alloc-id>
      ```
      ⚠️ Only `release-address` loses the IP — and that **is** irreversible and
      **would** require re-whitelisting in Mercury.
- [ ] Reconcile any payout left `UNRESOLVED` by this drill, per §3.3

### 3.5 Mercury API returning 5xx

- [ ] Confirm a 5xx is classified retryable, not a rejection. With the proxy
      pointed at an unreachable upstream (or during a real Mercury incident),
      force a run.
- [ ] **Expect** the same handling as §3.3: `needs_reconciliation`, hold stands,
      `status` stays `scheduled`, `UNRESOLVED` reason. **Not** an automatic
      reversal.
- [ ] Contrast with a genuine 4xx — Mercury refusing the request. Force a run
      for a creator whose `mercury_recipient_id` is bad:
      ```bash
      sql "update creator_wallets set mercury_recipient_id = '00000000-0000-0000-0000-000000000000'
           where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** the creator under `rejected`, `mercury_payouts.status = failed`,
      a `payout_failed +amount` ledger row, and `available_cents` **restored** —
      because a 4xx proves nothing was sent.
- [ ] Run the invariant check → **zero rows**
- [ ] Restore the real `mercury_recipient_id`

### 3.6 Creator invite expired

- [ ] Simulate by pointing the wallet at a dead invite id:
      ```bash
      sql "update creator_wallets
           set mercury_invite_status = 'created', payout_ready = false,
               mercury_invite_id = 'expired-invite-test'
           where creator_id = '$TEST_CREATOR';"
      ```
- [ ] In the app, tap **I'm done setting up**
- [ ] **Expect** either `Link expired, we sent a new one` (if Mercury reports
      `expired`) or a clean error — **never** a crash or a silent success
- [ ] If a fresh invite was issued, confirm a new email arrived and:
      ```bash
      sql "select mercury_invite_id, mercury_invite_status, mercury_invite_sent_at,
                  mercury_invite_reminder_sent_at
           from creator_wallets where creator_id = '$TEST_CREATOR';"
      ```
      **Expect** a new invite id and `mercury_invite_reminder_sent_at` reset to
      null — the reminder clock starts over.
- [ ] Test the 3-day reminder sweep:
      ```bash
      sql "update creator_wallets
           set mercury_invite_sent_at = now() - interval '4 days',
               mercury_invite_reminder_sent_at = null
           where creator_id = '$TEST_CREATOR';"
      curl -s -X POST $FN/mercury-onboarding-sweep \
        -H "x-cron-secret: $CRON_SECRET" -d '{"force": true}' | jq
      ```
      **Expect** `reminders_sent: 1`, and a reminder email arrives.
- [ ] Re-run the sweep immediately → **Expect** `reminders_sent: 0`. Creators get
      one nudge, not one per hour.
- [ ] Restore the creator to a clean state

---

## 4. Rollback drill — move a creator back to Stripe mid-cycle

Rehearse this before cutover. `payout_rail` is per creator, so a single broken
creator does not require rolling back the whole rail.

### 4.1 One creator back to Stripe

- [ ] Confirm they still have a Stripe Connect account (nothing was deleted):
      ```bash
      sql "select stripe_connect_account_id, payout_rail, payout_ready,
                  available_cents, pending_cents
           from creator_wallets where creator_id = '$TEST_CREATOR';"
      ```
- [ ] **Settle or reverse any in-flight Mercury payout first.** Moving a creator
      with money in `pending_cents` strands it on the wrong rail:
      ```bash
      sql "select id, status, amount_cents from mercury_payouts
           where creator_id = '$TEST_CREATOR' and status in ('scheduled','sending');"
      ```
      If any exist, resolve them per §3.3 before continuing.
- [ ] Flip the rail:
      ```bash
      sql "update creator_wallets set payout_rail = 'stripe'
           where creator_id = '$TEST_CREATOR';"
      ```
- [ ] Force a Mercury run → **Expect** the creator is **not** in `eligible`
- [ ] Run the invariant check → **zero rows**

> ⚠️ The Stripe cron is unscheduled by migration 068, so a creator on
> `payout_rail = 'stripe'` is paid by **nothing** until you either re-schedule
> the Stripe job (§4.2) or move them back to Mercury. Their balance is safe and
> carries; they simply are not paid meanwhile.

### 4.2 Whole rail back to Stripe

- [ ] `MERCURY_PAYOUTS_ENABLED = false` — takes effect on the next hourly
      firing, no deploy
- [ ] Move everyone back:
      ```bash
      sql "update creator_wallets set payout_rail = 'stripe' where payout_rail = 'mercury';"
      ```
- [ ] Remove the `DISABLED` guard in
      [supabase/functions/weekly-payouts/index.ts](supabase/functions/weekly-payouts/index.ts)
      and redeploy it
- [ ] Restore the Stripe helpers in
      [lib/wallet-api.ts](lib/wallet-api.ts) and re-point
      [lib/setup.ts](lib/setup.ts) at `getStripeConnectStatus`, then ship an app
      build — **otherwise the setup gate keeps reading `payout_ready` and
      creators cannot complete setup on Stripe**
- [ ] Re-schedule the Stripe cron with the SQL in
      [SETUP_MERCURY.md](SETUP_MERCURY.md) → *Rollback*
- [ ] ```bash
      sql "select jobname, schedule, active from cron.job where jobname like 'noni-%payout%';"
      ```
      **Expect** `noni-weekly-payouts` present and active, Mercury payouts
      present but harmless (the kill switch is off)
- [ ] Suspending a single creator without touching either rail:
      ```bash
      sql "update creator_wallets set payout_rail = 'none' where creator_id = '<uuid>';"
      ```

---

## 5. Kill switch drill

- [ ] Set `MERCURY_PAYOUTS_ENABLED = false`
- [ ] Force a run:
      ```bash
      curl -s -X POST $FN/mercury-weekly-payouts \
        -H "x-cron-secret: $CRON_SECRET" -H 'content-type: application/json' \
        -d '{"force": true}' | jq
      ```
      **Expect exactly:**
      ```json
      { "skipped": true, "reason": "payouts disabled",
        "hint": "set MERCURY_PAYOUTS_ENABLED='true' to arm the Sunday run" }
      ```
- [ ] Confirm it exited **without querying** — no new rows, no run claimed:
      ```bash
      sql "select count(*) from company_payout_runs where created_at > now() - interval '5 minutes';"
      ```
      **Expect `0`.** The check runs before the time-window gate and before any
      database read.
- [ ] Confirm `force: true` does **not** bypass the switch — the response above
      is identical with or without it
- [ ] Casing is strict — verify each of these leaves it dormant:
      `TRUE`, `True`, `1`, `yes`, empty, unset. **Only lowercase `true` arms it.**
- [ ] Let a real Sunday 20:00 ET firing pass with the switch off and confirm no
      payout rows were created
- [ ] Re-arm with exactly `true` and confirm a forced run proceeds

---

## 6. Cutover sign-off

Only tick these once everything above passes.

- [ ] Deploy window is **Monday–Friday** — no Sunday 20:00 ET falls between
      migration 068 landing and the kill switch being armed
- [ ] Enough creators have completed Mercury onboarding that the first live run
      is meaningful (creators who have not onboarded are paid by **neither** rail
      once 068 lands)
- [ ] `curl -s $PROXY/healthz | jq` → `ip` equals the whitelisted Elastic IP
- [ ] ```bash
      sql "select jobname, schedule, active from cron.job order by jobname;"
      ```
      Three `noni-mercury-*` jobs present; `noni-weekly-payouts` absent
- [ ] All six `mercury-*` edge functions deployed
- [ ] `MERCURY_WEBHOOK_SECRET` set, and `mercury-webhook` redeployed **after**
      it was set
- [ ] Invariant check → **zero rows**
- [ ] No unresolved payouts:
      ```bash
      sql "select count(*) from mercury_payouts
           where failure_reason like 'UNRESOLVED%';"
      ```
      **Expect `0`.**
- [ ] `MERCURY_PAYOUTS_ENABLED = true`
- [ ] Diary reminder: check the first live Sunday run at 20:15 ET
- [ ] Diary reminder: check Monday's `mercury-token-liveness` log

### First live Sunday — watch these

```bash
sql "select r.period_end, r.creators_paid, r.charged_cents, r.status, r.error
     from company_payout_runs r where r.period_end = current_date;"

sql "select status, count(*), sum(amount_cents)
     from mercury_payouts where period_end = current_date group by status;"
```

Then the invariant check → **zero rows**, and within a few days every payout
should read `sent`.
