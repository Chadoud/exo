/**
 * Stripe billing — customer mapping, Checkout/Portal sessions, subscription state.
 *
 * Card data never touches this server: Checkout and the Customer Portal are
 * Stripe-hosted. This module only maps accounts to Stripe customers and mirrors
 * subscription status into the `subscriptions` + `entitlements` tables.
 *
 * Webhook event dispatch lives in ./stripeWebhook.js.
 */

const config = require("./config");

/** Stripe statuses that keep paid access (past_due rides Stripe Smart Retries). */
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

let stripeSingleton = null;

/** Lazily construct the real Stripe client (tests inject a mock instead). */
function getStripe() {
  if (!stripeSingleton) {
    if (!config.stripe.secretKey) {
      const err = new Error("billing_not_configured");
      err.status = 503;
      throw err;
    }
    const Stripe = require("stripe");
    stripeSingleton = new Stripe(config.stripe.secretKey);
  }
  return stripeSingleton;
}

function billingEnabled() {
  return config.stripe.enabled && Boolean(config.stripe.secretKey);
}

/**
 * @param {"monthly" | "annual"} interval
 * @returns {string} Stripe price id
 */
function priceIdForInterval(interval) {
  if (interval === "monthly") return config.stripe.priceIdMonthly;
  if (interval === "annual") return config.stripe.priceIdAnnual;
  const err = new Error("invalid_interval");
  err.status = 422;
  throw err;
}

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} db
 * @param {string} accountId
 */
async function accountBillingRow(db, accountId) {
  const [rows] = await db.execute(
    "SELECT id, email, stripe_customer_id FROM accounts WHERE id = ? AND is_active = 1 LIMIT 1",
    [accountId],
  );
  return rows[0] || null;
}

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} db
 * @param {string} customerId
 * @returns {Promise<string | null>} account id
 */
async function accountIdForStripeCustomer(db, customerId) {
  if (!customerId) return null;
  const [rows] = await db.execute(
    "SELECT id FROM accounts WHERE stripe_customer_id = ? LIMIT 1",
    [customerId],
  );
  return rows[0]?.id || null;
}

/**
 * Latest relevant subscription row for an account: prefers entitled, then newest.
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} db
 * @param {string} accountId
 */
async function latestSubscriptionRow(db, accountId) {
  const [rows] = await db.execute(
    `SELECT stripe_subscription_id, stripe_price_id, status, current_period_end, cancel_at_period_end
     FROM subscriptions WHERE account_id = ?
     ORDER BY (status IN ('active','trialing','past_due')) DESC, updated_at DESC, id DESC
     LIMIT 1`,
    [accountId],
  );
  return rows[0] || null;
}

/** @param {{ status?: string } | null | undefined} row */
function isEntitledSubscriptionRow(row) {
  return Boolean(row && ENTITLED_STATUSES.has(String(row.status)));
}

/**
 * Ensure the account has a Stripe customer; create + persist one when missing.
 * @param {object} deps { pool, stripe }
 * @param {string} accountId
 * @returns {Promise<string>} stripe customer id
 */
async function ensureStripeCustomer(deps, accountId) {
  const { pool, stripe } = deps;
  const account = await accountBillingRow(pool, accountId);
  if (!account) {
    const err = new Error("invalid_token");
    err.status = 401;
    throw err;
  }
  if (account.stripe_customer_id) return account.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: account.email,
    metadata: { account_id: accountId },
  });
  await pool.execute(
    "UPDATE accounts SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL",
    [customer.id, accountId],
  );
  // Another request may have won the race — read back the persisted value.
  const persisted = await accountBillingRow(pool, accountId);
  return persisted?.stripe_customer_id || customer.id;
}

/**
 * Create a Stripe-hosted Checkout Session for the single Pro plan.
 * @param {object} deps { pool, stripe }
 * @param {string} accountId derived from the JWT — never client-supplied
 * @param {"monthly" | "annual"} interval
 * @returns {Promise<{ checkout_url: string }>}
 */
async function createCheckoutSession(deps, accountId, interval) {
  const { pool, stripe } = deps;
  const priceId = priceIdForInterval(interval);
  if (!priceId) {
    const err = new Error("billing_not_configured");
    err.status = 503;
    throw err;
  }

  const existing = await latestSubscriptionRow(pool, accountId);
  if (isEntitledSubscriptionRow(existing)) {
    const err = new Error("already_subscribed");
    err.status = 409;
    throw err;
  }

  const customerId = await ensureStripeCustomer(deps, accountId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: accountId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${config.appBaseUrl}/v1/billing/done?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appBaseUrl}/v1/billing/cancelled`,
    automatic_tax: { enabled: config.stripe.automaticTax },
    // Stripe Tax needs a customer address; let Checkout collect/update it.
    customer_update: { address: "auto" },
    billing_address_collection: "auto",
  });
  if (!session?.url) {
    const err = new Error("checkout_session_failed");
    err.status = 500;
    throw err;
  }
  return { checkout_url: session.url };
}

/**
 * Create a Stripe-hosted Customer Portal session (manage card / cancel).
 * @param {object} deps { pool, stripe }
 * @param {string} accountId
 * @returns {Promise<{ portal_url: string }>}
 */
async function createPortalSession(deps, accountId) {
  const { pool, stripe } = deps;
  const account = await accountBillingRow(pool, accountId);
  if (!account) {
    const err = new Error("invalid_token");
    err.status = 401;
    throw err;
  }
  if (!account.stripe_customer_id) {
    const err = new Error("no_stripe_customer");
    err.status = 404;
    throw err;
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: `${config.appBaseUrl}/v1/billing/done?from=portal`,
  });
  if (!session?.url) {
    const err = new Error("portal_session_failed");
    err.status = 500;
    throw err;
  }
  return { portal_url: session.url };
}

/**
 * Mirror a Stripe subscription object into `subscriptions` + `entitlements`.
 * Guarded by `last_event_created` so an out-of-order webhook can never regress
 * newer state. Entitlement is written from the read-back row (not the event),
 * keeping both tables consistent even when the guard rejects the update.
 *
 * @param {import("mysql2/promise").PoolConnection} conn open transaction
 * @param {string} accountId
 * @param {object} sub Stripe subscription (or synthetic { id, status: "canceled" })
 * @param {number} eventCreated Stripe event `created` (epoch seconds)
 */
async function applySubscriptionState(conn, accountId, sub, eventCreated) {
  const priceId = sub.items?.data?.[0]?.price?.id || "";
  // Stripe API >= 2025-03-31 moved current_period_end to the subscription item.
  const periodEndEpoch = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const periodEnd = periodEndEpoch ? new Date(periodEndEpoch * 1000) : null;
  const cancelAtPeriodEnd = sub.cancel_at_period_end ? 1 : 0;
  const guard = Number(eventCreated) || 0;

  await conn.execute(
    `INSERT INTO subscriptions
       (account_id, stripe_subscription_id, stripe_price_id, status, current_period_end, cancel_at_period_end, last_event_created)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       stripe_price_id = IF(VALUES(last_event_created) >= last_event_created, VALUES(stripe_price_id), stripe_price_id),
       status = IF(VALUES(last_event_created) >= last_event_created, VALUES(status), status),
       current_period_end = IF(VALUES(last_event_created) >= last_event_created, VALUES(current_period_end), current_period_end),
       cancel_at_period_end = IF(VALUES(last_event_created) >= last_event_created, VALUES(cancel_at_period_end), cancel_at_period_end),
       last_event_created = GREATEST(last_event_created, VALUES(last_event_created))`,
    [accountId, sub.id, priceId, String(sub.status || "canceled"), periodEnd, cancelAtPeriodEnd, guard],
  );

  const current = await latestSubscriptionRow(conn, accountId);
  const active = isEntitledSubscriptionRow(current) ? 1 : 0;
  await conn.execute(
    `INSERT INTO entitlements (account_id, feature, source, active, extra)
     VALUES (?, 'sort', 'stripe', ?, ?)
     ON DUPLICATE KEY UPDATE active = VALUES(active), extra = VALUES(extra)`,
    [
      accountId,
      active,
      JSON.stringify({
        status: current?.status || String(sub.status || "canceled"),
        subscription: current?.stripe_subscription_id || sub.id,
      }),
    ],
  );
}

/**
 * One account should never carry two live subscriptions (double billing).
 * Keeps the oldest entitled row, cancels newer duplicates at Stripe, and
 * mirrors the cancellation. Refund is a manual runbook step — alert loudly.
 *
 * @param {import("mysql2/promise").PoolConnection} conn open transaction
 * @param {object} stripe
 * @param {string} accountId
 * @param {number} eventCreated
 */
async function resolveDuplicateSubscriptions(conn, stripe, accountId, eventCreated) {
  const [rows] = await conn.execute(
    `SELECT stripe_subscription_id FROM subscriptions
     WHERE account_id = ? AND status IN ('active','trialing','past_due')
     ORDER BY created_at ASC, id ASC`,
    [accountId],
  );
  if (rows.length <= 1) return;

  const duplicates = rows.slice(1);
  for (const dup of duplicates) {
    console.error(
      `[billing] ALERT duplicate live subscription for account — cancelling ${dup.stripe_subscription_id}; manual refund may be owed (see billing runbook)`,
    );
    try {
      const canceled = await stripe.subscriptions.cancel(dup.stripe_subscription_id);
      await applySubscriptionState(conn, accountId, canceled, eventCreated);
    } catch (err) {
      console.error("[billing] duplicate cancel failed:", err?.message || err);
    }
  }
}

/**
 * Cancel any live subscription before an account is deleted, so a deleted
 * account can never keep getting billed. No proration/refund by default.
 * @param {string} accountId
 * @param {object} [deps] { pool, stripe } for tests
 */
async function cancelSubscriptionsForAccountDeletion(accountId, deps = null) {
  if (!billingEnabled() && !deps) return;
  const pool = deps?.pool || require("./db").getPool();
  const stripe = deps?.stripe || getStripe();
  const [rows] = await pool.execute(
    `SELECT stripe_subscription_id FROM subscriptions
     WHERE account_id = ? AND status IN ('active','trialing','past_due')`,
    [accountId],
  );
  for (const row of rows) {
    try {
      await stripe.subscriptions.cancel(row.stripe_subscription_id);
    } catch (err) {
      // Deletion must not be blocked by Stripe hiccups; alert for manual follow-up.
      console.error(
        `[billing] ALERT could not cancel ${row.stripe_subscription_id} during account deletion:`,
        err?.message || err,
      );
    }
  }
}

module.exports = {
  ENTITLED_STATUSES,
  getStripe,
  billingEnabled,
  priceIdForInterval,
  accountIdForStripeCustomer,
  latestSubscriptionRow,
  isEntitledSubscriptionRow,
  ensureStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  applySubscriptionState,
  resolveDuplicateSubscriptions,
  cancelSubscriptionsForAccountDeletion,
};
