# Billing operations (Stripe)

Single Pro plan: **CHF 20/month** or **CHF 200/year**. Card data never touches our
servers — Stripe Checkout and the Customer Portal are Stripe-hosted. Our cloud
API only maps accounts to Stripe customers and mirrors subscription status.

## Architecture in one paragraph

Desktop → `POST /v1/billing/checkout-session` (JWT) → Stripe Checkout in the
system browser → Stripe webhook (`/v1/webhooks/stripe`) updates `subscriptions`
+ `entitlements` → `/v1/me` exposes `subscription_*` fields → Electron caches
them in `subscription.json` (per profile) → Python backend + renderer gate on
it. After checkout the browser lands on `/v1/billing/done`, which deep-links
`exo://billing/complete` back into the app. The desktop trusts a cached
subscription for at most **7 days offline** (`OFFLINE_TRUST_DAYS`).

Key modules: `cloud-node/lib/stripeBilling.js`, `cloud-node/lib/stripeWebhook.js`,
`cloud-node/routes/billing.js`, `electron/entitlement/subscriptionState.js`,
`backend/subscription_state.py`.

## Initial setup (per environment)

1. Stripe Dashboard → create the product with two prices (CHF 20 monthly,
   CHF 200 yearly). Note the two `price_…` ids.
2. Developers → Webhooks → add endpoint `https://api.exosites.ch/v1/webhooks/stripe`
   with events: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`,
   `invoice.payment_succeeded|payment_failed`, `charge.dispute.created`.
   Note the `whsec_…` signing secret.
3. Enable Stripe Tax and complete Swiss VAT registration in the dashboard
   (Checkout uses `automatic_tax`; disable via `STRIPE_AUTOMATIC_TAX=0` until
   registration completes).
4. Customer Portal (Settings → Billing → Customer portal): allow payment-method
   update, plan switch between the two prices, cancellation at period end,
   invoice history.
5. `.env` on the API host (see `cloud-node/.env.example`):
   `STRIPE_BILLING_ENABLED=1`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`.
   Production refuses to boot when the secret key is set without the webhook
   secret; a `sk_test_` key in production logs a loud warning.
6. Apply migration 024: `node scripts/apply-migration-024.js`
   (idempotent; also wired into `scripts/deploy-cloud-api.sh`).
7. Verify: `GET /health` → `features.billing: true`;
   `GET /v1/public/client-config` → `billing.enabled: true`.

Rollback switch: set `STRIPE_BILLING_ENABLED=0` and restart — all billing
routes return 503, clients fall back to the pre-billing subscribe link, and
existing subscribers keep access via the webhook-maintained entitlement rows.

## Test-mode smoke (before go-live)

```bash
stripe listen --forward-to localhost:3000/v1/webhooks/stripe   # local secret
# In the app (staging cloud): Subscribe → card 4242 4242 4242 4242
# Failed payment: 4000 0000 0000 0341; dispute: 4000 0000 0000 0259
stripe trigger customer.subscription.updated                    # replay checks
```

Expected: duplicate deliveries answer `{"deduped":true}`; a test-mode event
against a production API answers `{"ignored":"livemode_mismatch"}` and writes
nothing.

## Recurring operations

| Task | How |
|---|---|
| Nightly reconciliation | Runs **in-process** automatically while billing is enabled (every `STRIPE_RECONCILE_INTERVAL_HOURS`, default 24; `0` disables). On demand: `node scripts/reconcile-subscriptions.js` (add `--dry-run` to audit). Re-fetches every live-ish subscription from Stripe and heals drift from missed webhooks. |
| Check webhook health | Stripe Dashboard → Webhooks → endpoint delivery log. Failing deliveries retry ~3 days; reconciliation covers longer gaps. |
| Refunds | Stripe Dashboard → Payments → refund. Status stays `active` unless you also cancel the subscription. |

## Alerts to watch in API logs

All billing log lines are prefixed `[billing]`.

- `ALERT duplicate live subscription` — the webhook auto-cancels the newer
  duplicate at Stripe but does **not** refund. Refund the duplicate charge in
  the dashboard.
- `ALERT payment dispute opened` — entitlement was deactivated immediately.
  Respond to the dispute in the dashboard; if won, re-run reconciliation (or
  the next webhook) to restore access.
- `ALERT could not cancel … during account deletion` — account was deleted but
  Stripe cancellation failed; cancel manually to stop billing.
- `ALERT reconcile drift` — a webhook was missed; state was re-applied from
  Stripe. Occasional single drifts are normal; repeated drift means webhook
  delivery is broken (check the endpoint + signing secret).
- `ALERT … unknown customer` — a Stripe event referenced a customer no account
  maps to; entitlement was NOT granted. Find the customer in the Stripe
  dashboard and backfill `accounts.stripe_customer_id`, then resend the event.
- `ALERT … livemode mismatch` — the Stripe endpoint mode (test/live) disagrees
  with the server's key. Events are dropped until the two match.
- `webhook processing failed` — handler error; the transaction rolled back and
  Stripe will retry. Investigate if it repeats.

Quick daily check: `grep "\[billing\] ALERT" server.log | tail`.

## User-support playbook

- **"I paid but the app still says trial ended"** — user must be signed in with
  the same account; ask them to reopen the app (entitlement re-syncs on poll).
  Server-side: check `subscriptions` row for the account, then Stripe Dashboard
  → the subscription. If drifted, run reconciliation.
- **"Payment failed" banner** — access continues during Stripe Smart Retries
  (`past_due` keeps the entitlement). The banner's CTA opens the Customer
  Portal to fix the card.
- **Cancel / invoices / change card** — Settings → Trial & license → Manage
  billing (Customer Portal). No support action needed.
- **Refund + revoke** — refund in dashboard **and** cancel the subscription
  (immediately, not period end). The webhook deactivates the entitlement.

## Data & privacy

- We store: `accounts.stripe_customer_id`, `subscriptions` (ids, status,
  period end), `stripe_events_processed` (event ids). No card data, no amounts.
- Account deletion cancels live subscriptions at Stripe first, then removes all
  billing rows (`cloud-node/lib/accountLifecycle.js`).

## Deferred (owner: product/eng)

- Renderer billing telemetry (checkout started/completed funnels) — money flow
  is fully observable in the Stripe Dashboard today; add events to
  `docs/analytics/event-registry.md` before building funnels.
- Automatic refund on duplicate-subscription auto-cancel (manual today).
