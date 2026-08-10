/**
 * In-memory Stripe fake. Webhook signature verification is REAL (delegates to
 * the stripe SDK's constructEvent/generateTestHeaderString) — only network
 * resources (customers, subscriptions, sessions) are faked.
 */

const Stripe = require("stripe");

function createMockStripe() {
  const real = new Stripe("sk_test_mock");
  /** @type {Map<string, object>} */
  const customers = new Map();
  /** @type {Map<string, object>} */
  const subscriptions = new Map();
  const calls = { checkoutSessions: [], portalSessions: [], canceled: [] };
  let counter = 0;

  return {
    webhooks: real.webhooks,
    customers: {
      create: async ({ email, metadata }) => {
        counter += 1;
        const customer = { id: `cus_mock_${counter}`, email, metadata };
        customers.set(customer.id, customer);
        return customer;
      },
    },
    subscriptions: {
      retrieve: async (id) => {
        const sub = subscriptions.get(id);
        if (!sub) {
          const err = new Error(`No such subscription: ${id}`);
          err.statusCode = 404;
          throw err;
        }
        return sub;
      },
      cancel: async (id) => {
        const sub = subscriptions.get(id) || { id };
        const canceled = { ...sub, status: "canceled" };
        subscriptions.set(id, canceled);
        calls.canceled.push(id);
        return canceled;
      },
    },
    checkout: {
      sessions: {
        create: async (params) => {
          calls.checkoutSessions.push(params);
          counter += 1;
          return { id: `cs_mock_${counter}`, url: `https://checkout.stripe.com/c/pay/cs_mock_${counter}` };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params) => {
          calls.portalSessions.push(params);
          counter += 1;
          return { id: `bps_mock_${counter}`, url: `https://billing.stripe.com/p/session/bps_mock_${counter}` };
        },
      },
    },
    /** Seed a subscription that retrieve()/cancel() will find. */
    _setSubscription: (sub) => subscriptions.set(sub.id, sub),
    _customers: customers,
    _calls: calls,
  };
}

/**
 * Build a signed webhook request body + header the real constructEvent accepts.
 * @param {object} event plain event object
 * @param {string} secret webhook signing secret
 */
function signedWebhook(event, secret) {
  const payload = JSON.stringify(event);
  const real = new Stripe("sk_test_mock");
  const header = real.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

module.exports = { createMockStripe, signedWebhook };
