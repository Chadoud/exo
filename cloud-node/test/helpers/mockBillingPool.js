/** In-memory MySQL pool mock for Stripe billing unit tests (transaction-aware). */

function createBillingMockPool() {
  const state = {
    /** @type {Record<string, { id: string; email: string; stripe_customer_id: string | null }>} */
    accounts: {},
    /** @type {Array<object>} keyed by stripe_subscription_id */
    subscriptions: [],
    /** @type {Array<{ account_id: string; feature: string; source: string; active: number; extra: string }>} */
    entitlements: [],
    /** @type {Record<string, { event_type: string; account_id: string | null }>} */
    events: {},
    /** @type {Array<{ admin_account_id: string; action: string; target_account_id: string; details: string }>} */
    adminAudit: [],
    nextSubId: 1,
    updateSeq: 1,
  };

  let snapshot = null;
  /** @type {Set<string>} */
  const productAdmins = new Set();

  function addAccount(id, email, stripeCustomerId = null, opts = {}) {
    state.accounts[id] = {
      id,
      email,
      stripe_customer_id: stripeCustomerId,
      is_active: 1,
      first_name: null,
      last_name: null,
      created_at: "2026-01-01T00:00:00.000Z",
      trial_ends_at: null,
      ...opts,
    };
  }

  function addProductAdmin(id) {
    productAdmins.add(id);
  }

  const ENTITLED = new Set(["active", "trialing", "past_due"]);

  async function query(sql, params = []) {
    const q = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (q.startsWith("select id, email, stripe_customer_id from accounts")) {
      const [id] = params;
      const row = state.accounts[id];
      return [row ? [row] : []];
    }

    if (q.startsWith("select id, is_active, stripe_customer_id from accounts where email")) {
      const [email] = params;
      const row = Object.values(state.accounts).find((a) => a.email === email);
      return [
        row ? [{ id: row.id, is_active: row.is_active, stripe_customer_id: row.stripe_customer_id }] : [],
      ];
    }

    if (q.startsWith("select id, email, first_name, last_name, created_at, trial_ends_at from accounts")) {
      const [id] = params;
      const row = state.accounts[id];
      return [row && row.is_active ? [row] : []];
    }

    if (q.startsWith("select display_name, locale from user_profiles")) {
      return [[]];
    }

    if (q.startsWith("select bytes_balance from wallets")) {
      return [[]];
    }

    if (q.startsWith("select feature, source, active, extra from entitlements")) {
      const [accountId] = params;
      return [state.entitlements.filter((e) => e.account_id === accountId)];
    }

    if (q.startsWith("update accounts set trial_ends_at")) {
      // Mirrors DATE_ADD(GREATEST(COALESCE(trial_ends_at, now), now), INTERVAL ? DAY).
      const [days, id] = params;
      const row = state.accounts[id];
      if (!row || !row.is_active) return [{ affectedRows: 0 }];
      const nowMs = Date.now();
      const baseMs = Math.max(row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : nowMs, nowMs);
      row.trial_ends_at = new Date(baseMs + Number(days) * 24 * 60 * 60 * 1000).toISOString();
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("select trial_ends_at from accounts")) {
      const [id] = params;
      const row = state.accounts[id];
      return [row ? [{ trial_ends_at: row.trial_ends_at }] : []];
    }

    if (q.startsWith("insert into admin_audit")) {
      const [adminAccountId, action, targetAccountId, details] = params;
      state.adminAudit.push({
        admin_account_id: adminAccountId,
        action,
        target_account_id: targetAccountId,
        details,
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("select stripe_subscription_id, status from subscriptions")) {
      const [accountId] = params;
      return [
        state.subscriptions
          .filter((s) => s.account_id === accountId)
          .map((s) => ({ stripe_subscription_id: s.stripe_subscription_id, status: s.status })),
      ];
    }

    if (q.startsWith("select 1 from product_admins")) {
      const [accountId] = params;
      return [productAdmins.has(accountId) ? [{ 1: 1 }] : []];
    }

    if (q.startsWith("select id from accounts where stripe_customer_id")) {
      const [customerId] = params;
      const row = Object.values(state.accounts).find((a) => a.stripe_customer_id === customerId);
      return [row ? [{ id: row.id }] : []];
    }

    if (q.startsWith("update accounts set stripe_customer_id")) {
      const [customerId, id] = params;
      const row = state.accounts[id];
      if (row && row.stripe_customer_id == null) {
        row.stripe_customer_id = customerId;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (q.startsWith("insert into subscriptions")) {
      const [accountId, subId, priceId, status, periodEnd, cancelAtPeriodEnd, guard] = params;
      const existing = state.subscriptions.find((s) => s.stripe_subscription_id === subId);
      if (!existing) {
        state.subscriptions.push({
          id: state.nextSubId++,
          account_id: accountId,
          stripe_subscription_id: subId,
          stripe_price_id: priceId,
          status,
          current_period_end: periodEnd,
          cancel_at_period_end: Number(cancelAtPeriodEnd),
          last_event_created: Number(guard),
          created_seq: state.nextSubId,
          updated_seq: state.updateSeq++,
        });
        return [{ affectedRows: 1 }];
      }
      // Mirrors the SQL guard: only newer-or-equal events overwrite state.
      if (Number(guard) >= existing.last_event_created) {
        existing.stripe_price_id = priceId;
        existing.status = status;
        existing.current_period_end = periodEnd;
        existing.cancel_at_period_end = Number(cancelAtPeriodEnd);
        existing.updated_seq = state.updateSeq++;
      }
      existing.last_event_created = Math.max(existing.last_event_created, Number(guard));
      return [{ affectedRows: 2 }];
    }

    if (
      q.startsWith("select stripe_subscription_id, stripe_price_id, status") ||
      q.startsWith("select status, current_period_end, cancel_at_period_end from subscriptions")
    ) {
      const [accountId] = params;
      const rows = state.subscriptions
        .filter((s) => s.account_id === accountId)
        .sort((a, b) => {
          const ea = ENTITLED.has(a.status) ? 1 : 0;
          const eb = ENTITLED.has(b.status) ? 1 : 0;
          if (ea !== eb) return eb - ea;
          if (a.updated_seq !== b.updated_seq) return b.updated_seq - a.updated_seq;
          return b.id - a.id;
        });
      return [rows.slice(0, 1)];
    }

    if (q.startsWith("select account_id, stripe_subscription_id, status from subscriptions")) {
      // Reconcile scan: entitled statuses plus 'incomplete'.
      const SCAN = new Set([...ENTITLED, "incomplete"]);
      const rows = state.subscriptions
        .filter((s) => SCAN.has(s.status))
        .map((s) => ({
          account_id: s.account_id,
          stripe_subscription_id: s.stripe_subscription_id,
          status: s.status,
        }));
      return [rows];
    }

    if (q.startsWith("select stripe_subscription_id from subscriptions")) {
      const [accountId] = params;
      const rows = state.subscriptions
        .filter((s) => s.account_id === accountId && ENTITLED.has(s.status))
        .sort((a, b) => a.created_seq - b.created_seq || a.id - b.id)
        .map((s) => ({ stripe_subscription_id: s.stripe_subscription_id, status: s.status }));
      return [rows];
    }

    if (q.startsWith("insert into entitlements")) {
      const accountId = params[0];
      const isDisputeWrite = q.includes("0, ?)");
      const active = isDisputeWrite ? 0 : Number(params[1]);
      const extra = isDisputeWrite ? params[1] : params[2];
      const existing = state.entitlements.find(
        (e) => e.account_id === accountId && e.feature === "sort" && e.source === "stripe",
      );
      if (existing) {
        existing.active = active;
        existing.extra = extra;
      } else {
        state.entitlements.push({ account_id: accountId, feature: "sort", source: "stripe", active, extra });
      }
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("insert ignore into stripe_events_processed")) {
      const [eventId, eventType] = params;
      if (state.events[eventId]) {
        return [{ affectedRows: 0 }];
      }
      state.events[eventId] = { event_type: eventType, account_id: null };
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("update stripe_events_processed set account_id")) {
      const [accountId, eventId] = params;
      if (state.events[eventId]) state.events[eventId].account_id = accountId;
      return [{ affectedRows: 1 }];
    }

    throw new Error(`mockBillingPool: unhandled query: ${sql.slice(0, 100)}`);
  }

  const conn = {
    execute: query,
    query,
    beginTransaction: async () => {
      snapshot = structuredClone(state);
    },
    commit: async () => {
      snapshot = null;
    },
    rollback: async () => {
      if (snapshot) {
        Object.assign(state, structuredClone(snapshot));
        snapshot = null;
      }
    },
    release: () => {},
  };

  return {
    execute: query,
    query,
    getConnection: async () => conn,
    state,
    addAccount,
    addProductAdmin,
  };
}

module.exports = { createBillingMockPool };
