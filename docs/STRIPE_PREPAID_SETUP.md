# Stripe prepaid credits setup (Field Vision AI)

Configure the Field Vision AI Stripe account for Noni company top-ups and creator Connect payouts.

## 1. Connect Express + Transfers (creators)

1. In Stripe Dashboard → **Settings → Connect**, enable **Express** accounts.
2. Ensure **Transfers** (destination charges / platform balance transfers) are available for your country.
3. Creators onboard via Noni’s `stripe-connect` edge function; Sunday payouts use Transfers of creator net balances.

## 2. Checkout / card payments (company top-ups)

1. Enable **Cards** under Payment methods.
2. Checkout **payment** mode must be allowed (companies prepay credits; `$500` paid → `50000` credit_balance_cents).
3. Optional: keep US bank account / Setup mode only as a secondary saved payment path — top-up Checkout is primary.

## 3. Webhook events

Point a webhook endpoint at Noni’s `stripe-webhook` function and subscribe at least to:

- `checkout.session.completed` — company credit top-ups (`purpose=company_credit_topup`) and optional bank setup
- `transfer.created` / `transfer.updated` / `transfer.failed` (or `transfer.*`)
- `account.updated` — Connect Express status for creators

## 4. Webhook URL

```
https://zdcmmzofnrdqbwexuqnm.supabase.co/functions/v1/stripe-webhook
```

## 5. Secrets

Set on the Supabase project (edge function secrets):

| Secret | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Platform secret key (test or live) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint above |

Redeploy `company-billing`, `stripe-webhook`, and `weekly-payouts` after changing secrets.

## 6. Test mode checklist

1. Use test `STRIPE_SECRET_KEY` + matching webhook secret (Stripe CLI or Dashboard test endpoint).
2. As a company admin, open **Billing** → choose an amount chip → **Add credits**.
3. Complete Checkout with a test card (`4242…`).
4. Confirm webhook `checkout.session.completed` credits `company_billing.credit_balance_cents` and a `company_credit_ledger` topup row.
5. Trigger a bounty/streak earn; company balance drops by `ceil(G × 1.10)`, creator wallet rises by `floor(G × 0.97)`.
6. Confirm Sunday `weekly-payouts` Transfers send creator **net** available balance (no company ACH charge).

## 7. Platform take and Sunday transfers

- On each earning, platform keeps the spread: company pays **10%** on gross, creator receives **97%** (3% fee). That residual stays in the **Stripe platform balance** funded by prepaid top-ups.
- Sunday 8PM ET job only **Transfers** creator net to Connect Express — companies are not charged again; they already prepaid credits.
