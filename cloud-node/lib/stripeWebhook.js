/**
 * Stripe webhook event processing.
 *
 * Trust model: the signature (verified in the route) is the only auth. Events
 * are treated as a "poke" — subscription state is re-fetched from the Stripe
 * API rather than trusted from the event payload, so out-of-order delivery
 * cannot regress newer state (belt: re-fetch; braces: last_event_created guard
 * in applySubscriptionState).
 *
 * Idempotency is transactional: the event-id insert shares the transaction
 * with the state write. A handler crash rolls both back, so a genuine Stripe
 * retry re-attempts; a duplicate delivery no-ops on the id collision.
 */

const {
  accountIdForStripeCustomer,
  applySubscriptionState,
  resolveDuplicateSubscriptions,
} = require("./stripeBilling");

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/** Log-only events — dedupe recorded, no independent state write (avoids racing subscription.updated). */
const LOGGED_EVENTS = new Set(["invoice.payment_failed", "invoice.payment_succeeded"]);

/**
 * Fetch current subscription truth from Stripe; fall back to the event object
 * marked canceled when Stripe no longer returns it.
 * @param {object} stripe
 * @param {object} eventSub subscription object from the event payload
 */
async function fetchSubscriptionTruth(stripe, eventSub) {
  try {
    return await stripe.subscriptions.retrieve(eventSub.id);
  } catch {
    return { ...eventSub, status: "canceled" };
  }
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} stripe
 * @param {object} event verified Stripe event
 * @returns {Promise<{ handled: string; accountId: string | null }>}
 */
async function dispatchEvent(conn, stripe, event) {
  const type = event.type;
  const object = event.data?.object || {};

  if (type === "checkout.session.completed") {
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    let accountId = await accountIdForStripeCustomer(conn, customerId);
    if (!accountId && object.client_reference_id) {
      // Defense-in-depth: backfill the mapping from the session we created.
      accountId = String(object.client_reference_id);
      await conn.execute(
        "UPDATE accounts SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL",
        [customerId, accountId],
      );
    }
    if (!accountId) {
      console.error(
        "[billing] ALERT checkout.session.completed with unknown customer (entitlement not granted):",
        customerId,
      );
      return { handled: "unresolved_customer", accountId: null };
    }
    if (!object.subscription) {
      return { handled: "no_subscription_on_session", accountId };
    }
    const subId = typeof object.subscription === "string" ? object.subscription : object.subscription.id;
    const sub = await fetchSubscriptionTruth(stripe, { id: subId });
    await applySubscriptionState(conn, accountId, sub, event.created);
    await resolveDuplicateSubscriptions(conn, stripe, accountId, event.created);
    return { handled: type, accountId };
  }

  if (SUBSCRIPTION_EVENTS.has(type)) {
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const accountId = await accountIdForStripeCustomer(conn, customerId);
    if (!accountId) {
      console.error(`[billing] ALERT ${type} with unknown customer (state not applied):`, customerId);
      return { handled: "unresolved_customer", accountId: null };
    }
    const sub =
      type === "customer.subscription.deleted"
        ? { ...object, status: "canceled" }
        : await fetchSubscriptionTruth(stripe, object);
    await applySubscriptionState(conn, accountId, sub, event.created);
    if (type !== "customer.subscription.deleted") {
      await resolveDuplicateSubscriptions(conn, stripe, accountId, event.created);
    }
    return { handled: type, accountId };
  }

  if (type === "charge.dispute.created") {
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const accountId = await accountIdForStripeCustomer(conn, customerId);
    if (accountId) {
      console.error(
        `[billing] ALERT payment dispute opened for account ${accountId} — entitlement deactivated, review manually (billing runbook)`,
      );
      await conn.execute(
        `INSERT INTO entitlements (account_id, feature, source, active, extra)
         VALUES (?, 'sort', 'stripe', 0, ?)
         ON DUPLICATE KEY UPDATE active = 0, extra = VALUES(extra)`,
        [accountId, JSON.stringify({ status: "disputed", dispute: object.id || null })],
      );
    } else {
      console.error("[billing] ALERT dispute for unknown customer:", customerId);
    }
    return { handled: type, accountId: accountId || null };
  }

  if (LOGGED_EVENTS.has(type)) {
    return { handled: "logged", accountId: null };
  }

  return { handled: "ignored", accountId: null };
}

/**
 * Process one verified Stripe event inside a single transaction.
 * @param {object} deps { pool, stripe, expectLivemode }
 * @param {object} event verified Stripe event
 * @returns {Promise<{ ok: true; deduped?: boolean; ignored?: string; handled?: string }>}
 */
async function processStripeEvent(deps, event) {
  const { pool, stripe, expectLivemode } = deps;

  // A test-mode event must never mutate state written by live-mode keys (and
  // vice versa). Compared against the configured key's mode, not NODE_ENV —
  // a mismatch means the Stripe endpoint and server key disagree: alert.
  if (Boolean(event.livemode) !== Boolean(expectLivemode)) {
    console.error(
      `[billing] ALERT ignoring ${event.type}: livemode mismatch (event livemode=${event.livemode}, key expects ${expectLivemode ? "live" : "test"})`,
    );
    return { ok: true, ignored: "livemode_mismatch" };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [inserted] = await conn.execute(
      "INSERT IGNORE INTO stripe_events_processed (stripe_event_id, event_type) VALUES (?, ?)",
      [event.id, event.type],
    );
    if (!inserted.affectedRows) {
      await conn.rollback();
      return { ok: true, deduped: true };
    }
    const result = await dispatchEvent(conn, stripe, event);
    if (result.accountId) {
      await conn.execute(
        "UPDATE stripe_events_processed SET account_id = ? WHERE stripe_event_id = ?",
        [result.accountId, event.id],
      );
    }
    await conn.commit();
    return { ok: true, handled: result.handled };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { processStripeEvent, dispatchEvent, fetchSubscriptionTruth };
