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
    /** @type {Record<string, { display_name: string | null; locale: string; work_role: string | null }>} */
    profiles: {},
    /** @type {Array<{ account_id: string | null; platform: string; store_original_id: string; product_id: string; status: string; environment: string; retired?: number; current_period_end?: Date | string | null; auto_renew?: number; updated_at?: number }>} */
    storeSubscriptions: [],
    /** @type {Record<string, { provider: string; event_type: string | null; account_id: string | null }>} */
    storeEvents: {},
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
      store_billing_exempt: 0,
      ...opts,
    };
    if (!state.profiles[id]) {
      state.profiles[id] = { display_name: null, locale: "en", work_role: null };
    }
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

    if (
      q.startsWith("select id, email, first_name, last_name, created_at, trial_ends_at, store_billing_exempt from accounts") ||
      q.startsWith("select id, email, first_name, last_name, created_at, trial_ends_at from accounts")
    ) {
      const [id] = params;
      const row = state.accounts[id];
      return [row && row.is_active ? [row] : []];
    }

    if (q.startsWith("select store_billing_exempt from accounts")) {
      const [id] = params;
      const row = state.accounts[id];
      return [row && row.is_active ? [{ store_billing_exempt: row.store_billing_exempt || 0 }] : []];
    }

    if (q.startsWith("select display_name, locale, work_role from user_profiles") || q.startsWith("select display_name, locale from user_profiles")) {
      const [id] = params;
      const profile = state.profiles[id];
      return [profile ? [profile] : []];
    }

    if (q.startsWith("update user_profiles set")) {
      const id = params[params.length - 1];
      const profile = state.profiles[id] || { display_name: null, locale: "en", work_role: null };
      if (q.includes("display_name = ?") && q.includes("work_role = ?")) {
        profile.display_name = params[0];
        profile.work_role = params[1];
      } else if (q.includes("display_name = ?")) {
        profile.display_name = params[0];
      } else if (q.includes("work_role = ?")) {
        profile.work_role = params[0];
      }
      state.profiles[id] = profile;
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("select 1 from entitlements")) {
      const [accountId] = params;
      const hit = state.entitlements.find(
        (e) =>
          e.account_id === accountId &&
          e.feature === "sort" &&
          Number(e.active) === 1 &&
          (e.source === "app_store" || e.source === "play"),
      );
      return [hit ? [{ 1: 1 }] : []];
    }

    if (q.startsWith("select 1 from subscriptions")) {
      const [accountId] = params;
      const hit = state.subscriptions.find((s) => s.account_id === accountId && ENTITLED.has(s.status));
      return [hit ? [{ 1: 1 }] : []];
    }

    if (
      q.startsWith("select account_id from store_subscriptions") ||
      q.startsWith("select account_id, retired from store_subscriptions")
    ) {
      const [platform, originalId] = params;
      const row = state.storeSubscriptions.find(
        (s) => s.platform === platform && s.store_original_id === originalId,
      );
      return [row ? [{ account_id: row.account_id, retired: row.retired || 0 }] : []];
    }

    if (q.startsWith("select platform, product_id, status, current_period_end, auto_renew, retired")) {
      const [accountId] = params;
      const rows = state.storeSubscriptions
        .filter((s) => s.account_id === accountId && !s.retired)
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      return [rows];
    }

    if (q.startsWith("select platform, store_original_id, product_id, status, current_period_end, auto_renew, retired")) {
      const [accountId] = params;
      return [state.storeSubscriptions.filter((s) => s.account_id === accountId && !s.retired)];
    }

    if (q.startsWith("select account_id, platform, store_original_id, status, environment from store_subscriptions")) {
      return [
        state.storeSubscriptions
          .filter((s) => s.account_id && !s.retired)
          .map((s) => ({
            account_id: s.account_id,
            platform: s.platform,
            store_original_id: s.store_original_id,
            status: s.status,
            environment: s.environment,
          })),
      ];
    }

    if (q.startsWith("insert ignore into store_events_processed")) {
      const [eventId, provider, eventType, accountId] = params;
      if (state.storeEvents[eventId]) return [{ affectedRows: 0 }];
      state.storeEvents[eventId] = { provider, event_type: eventType, account_id: accountId };
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("update store_events_processed set account_id")) {
      const [accountId] = params;
      for (const ev of Object.values(state.storeEvents)) {
        if (ev.account_id === accountId) ev.account_id = null;
      }
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("update store_subscriptions") && q.includes("retired = 1")) {
      const [accountId] = params;
      for (const row of state.storeSubscriptions) {
        if (row.account_id === accountId) {
          row.account_id = null;
          row.retired = 1;
          row.status = "canceled";
          row.auto_renew = 0;
        }
      }
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("update entitlements set active = 0")) {
      const [accountId] = params;
      for (const row of state.entitlements) {
        if (row.account_id === accountId && (row.source === "app_store" || row.source === "play")) {
          row.active = 0;
        }
      }
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("insert into store_subscriptions")) {
      const [accountId, platform, originalId, productId, status, environment, periodEnd, autoRenew] = params;
      const existing = state.storeSubscriptions.find(
        (s) => s.platform === platform && s.store_original_id === originalId,
      );
      const next = {
        account_id: accountId,
        product_id: productId,
        status,
        environment,
        retired: 0,
        auto_renew: autoRenew ? 1 : 0,
        current_period_end: periodEnd || null,
        updated_at: Date.now(),
      };
      if (existing) {
        Object.assign(existing, next);
      } else {
        state.storeSubscriptions.push({
          platform,
          store_original_id: originalId,
          ...next,
        });
      }
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("select bytes_balance from wallets")) {
      return [[]];
    }

    if (q.startsWith("select feature, source, active from entitlements") || q.startsWith("select feature, source, active, extra from entitlements")) {
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
      let source = "stripe";
      let active;
      let extra;
      if (q.includes("values (?, 'sort', ?, ?, ?)")) {
        source = params[1];
        active = Number(params[2]);
        extra = params[3];
      } else if (q.includes("values (?, 'sort', 'stripe', 0, ?)")) {
        active = 0;
        extra = params[1];
      } else {
        active = Number(params[1]);
        extra = params[2];
      }
      const existing = state.entitlements.find(
        (e) => e.account_id === accountId && e.feature === "sort" && e.source === source,
      );
      if (existing) {
        existing.active = active;
        existing.extra = extra;
      } else {
        state.entitlements.push({ account_id: accountId, feature: "sort", source, active, extra });
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
