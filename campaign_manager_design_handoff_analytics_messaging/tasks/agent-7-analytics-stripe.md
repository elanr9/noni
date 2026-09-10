# Agent 7: Analytics Stripe gating

Reference: reference_ui/AnalyticsScreens.jsx.txt. Touch: app/(admin)/(tabs)/analytics.tsx, components/admin/insights/, TimeSeriesChart.tsx, lib/analytics-api.ts, lib/company-billing-api.ts.

## Principle
Money exists only from the day the company's Stripe was connected. Views, posts, and sign-ups come from the platforms and are NEVER gated. There is no fabricated money history before the connect date.

## Spec
- Source of truth: the company's stripeConnectedAt date (lib/company-billing-api.ts). Reference models it as A_STRIPE { sinceDay, since } with helper aMoneyOn(stripe, day).
- Top stats: Paid out value aggregates only from the connect date; hint reads "since <date>" (e.g. "since Aug 11").
- Calendar: $ badge only on days on/after the connect date. Footnote: "$ = sales, tracked since <date> · dot = posts". If Stripe is not connected at all: "$ appears once Stripe is connected · dot = posts" and no $ anywhere.
- Day detail: summary shows "views · sign-ups" and appends "· $X sales" only when gated on. For earlier days add: "No money data for this day. Stripe was connected <date>."
- Post rows: earned amount (green) only for posts on/after the connect date. Post detail Earned cell shows "Not tracked" before it.
- Everything else (filters, sort menus, ranges, charts, creators ranking, formats) is ungated and per reference.

## Acceptance
- Flip stripeConnectedAt and watch every money surface obey it; no dollar value ever renders for a pre-connect day.
