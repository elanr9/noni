# Notes

Known follow-ups that are deliberately out of scope for the work that surfaced
them. Each one records what is true today, why it was left, and what fixing it
involves.

---

## 1. Ledger UI relabeling (Mercury payouts)

**Status:** ✅ done 2026-08-17. Implemented as `ledgerRowLabel()` and
`isLedgerRowPending()` in [lib/wallet-api.ts](lib/wallet-api.ts), consumed by
[app/(creator)/balance.tsx](app/(creator)/balance.tsx). Kept here for context.

The Mercury rail writes **one** debit per payout. `payout_hold` (`-amount`) is
written at send time and there is no `payout_paid` row on settlement, because a
second negative row would debit the creator twice for a single payment.

The consequence is cosmetic but creator-facing: `ledgerKindLabel()` in
[lib/wallet-api.ts](lib/wallet-api.ts) maps `payout_hold` to **"Cash out hold"**,
so a creator who has been paid still sees "hold" against the debit forever.

**Fix:** after settlement the label should come from `mercury_payouts.status`,
not from the ledger `kind`:

| `mercury_payouts.status` | label |
|---|---|
| `scheduled` / `sending` | Cash out pending |
| `sent` | Cash out paid |
| `failed` / `reversed` | Cash out failed |

The join is available: `wallet_ledger.mercury_payout_id → mercury_payouts.id`
(added in `067_wallet_ledger_mercury_link.sql`). Failed payouts additionally get
a real `payout_failed` (`+amount`) row, so the reversal is already visible in
history without any change.

Stripe-rail rows are unaffected — they keep using `wallet_ledger.payout_id` and
their existing labels.

---

## 2. Pre-existing Stripe `wallet_ledger` drift

**Status:** open — needs a separate correcting migration. Not part of the
Mercury build, and Mercury migrations 066–068 deliberately do not touch it.

The Stripe payout path double-debits the ledger. Every successful payout writes
**two** negative rows for one payment:

- [weekly-payouts/index.ts](supabase/functions/weekly-payouts/index.ts) — `payout_hold` `-amount`, and decrements `available_cents`
- [stripe-webhook/index.ts](supabase/functions/stripe-webhook/index.ts) `markPayoutPaid()` — `payout_paid` `-amount`, decrements `pending_cents` only

Replayed against Postgres, a single $50 payout:

| step | `sum(wallet_ledger)` | `available_cents` | `pending_cents` |
|---|---|---|---|
| after earning $50 | 5000 | 5000 | 0 |
| after hold | 0 | 0 | 5000 |
| **after paid** | **−5000** | **0** | 0 |

So `sum(wallet_ledger.amount_cents) == creator_wallets.available_cents` — the
invariant the Mercury rail maintains — **does not hold on the Stripe rail.**

**Impact.** `creator_wallets.available_cents` is authoritative and correct;
payouts and balances shown to creators are right. The damage is confined to
anything that *derives* a balance by summing the ledger. Every creator ever paid
through Stripe has a ledger sum understated by their lifetime payout total, and
the gap grows with each payout.

**Fix when it matters:** a one-off migration inserting a compensating
`adjustment` row per historical `payout_paid` (`+amount`, note explaining the
correction), or dropping the `payout_paid` rows outright — the hold already
carries the debit. Verify with:

```sql
select w.creator_id,
       w.available_cents,
       coalesce(sum(l.amount_cents), 0) as ledger_sum,
       w.available_cents - coalesce(sum(l.amount_cents), 0) as drift
from creator_wallets w
left join wallet_ledger l
  on l.creator_id = w.creator_id and l.company_id = w.company_id
group by w.creator_id, w.available_cents
having w.available_cents <> coalesce(sum(l.amount_cents), 0);
```

Do this before building any reporting on `sum(wallet_ledger)`.
