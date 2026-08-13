const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");
const { getPool } = require("./db");
const { isAccountProductAdmin } = require("./productAdmins");
const { latestSubscriptionRow, isEntitledSubscriptionRow } = require("./stripeBilling");
const { createVerifyToken } = require("./emailVerification");
const { sendEmail } = require("./email");
const { verifyEmailTemplate } = require("./emailTemplates");

const BCRYPT_ROUNDS = 12;
const NAME_MAX_LENGTH = 120;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Trim and cap a registrant name for storage.
 * @param {string} value
 * @returns {string}
 */
function normalizePersonName(value) {
  return String(value || "").trim().slice(0, NAME_MAX_LENGTH);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isValidPersonName(value) {
  return normalizePersonName(value).length > 0;
}

/**
 * Insert a new account row plus its default wallet, entitlement, and profile.
 * Runs inside the caller's transaction. `passwordHash` may be null for social-only accounts.
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} id account UUID
 * @param {string} email normalized email
 * @param {string | null} passwordHash
 * @param {{ firstName?: string | null, lastName?: string | null }} [names]
 */
async function provisionAccount(conn, id, email, passwordHash, names = {}) {
  const firstName = normalizePersonName(names.firstName);
  const lastName = normalizePersonName(names.lastName);
  // Social-only accounts (no password) arrive here only after verifyIdToken()
  // confirmed the provider's email_verified claim — already trustworthy.
  // Password signups start unverified until they click the verify-email link.
  const emailVerified = passwordHash === null ? 1 : 0;
  await conn.execute(
    `INSERT INTO accounts (id, email, first_name, last_name, password_hash, email_verified, trial_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))`,
    [id, email, firstName || null, lastName || null, passwordHash, emailVerified, config.freeTrialDays],
  );
  await conn.execute("INSERT INTO wallets (account_id, bytes_balance) VALUES (?, 0)", [id]);
  await conn.execute(
    `INSERT INTO entitlements (account_id, feature, source, active, extra)
     VALUES (?, 'sort', 'free_trial', 1, ?)`,
    [id, JSON.stringify({ note: "30-day free trial", days: config.freeTrialDays })],
  );
  await conn.execute(
    "INSERT INTO user_profiles (account_id, locale) VALUES (?, 'en')",
    [id],
  );
}

/**
 * Best-effort — a token-creation or delivery hiccup must never fail
 * registration (the account already committed by the time this runs).
 * @param {string} accountId
 * @param {string} email
 */
async function sendVerificationEmail(accountId, email) {
  try {
    const token = await createVerifyToken(accountId);
    const verifyUrl = `${config.appBaseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = verifyEmailTemplate(verifyUrl);
    await sendEmail({ to: email, subject, html, text });
  } catch (e) {
    console.error("[accounts] ALERT could not send verification email:", e?.message || e);
  }
}

/**
 * @param {string} email
 * @param {string} password
 * @param {{ firstName: string, lastName: string }} names
 */
async function registerAccount(email, password, names) {
  const pool = getPool();
  const normalized = email.trim().toLowerCase();
  const firstName = normalizePersonName(names?.firstName);
  const lastName = normalizePersonName(names?.lastName);
  if (!isValidPersonName(firstName) || !isValidPersonName(lastName)) {
    const err = new Error("First and last name are required");
    err.status = 422;
    throw err;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    err.status = 400;
    throw err;
  }

  const [existing] = await pool.execute(
    "SELECT id FROM accounts WHERE email = ? LIMIT 1",
    [normalized],
  );
  if (existing.length > 0) {
    const err = new Error("Email already registered");
    err.status = 409;
    throw err;
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await provisionAccount(conn, id, normalized, passwordHash, { firstName, lastName });
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await sendVerificationEmail(id, normalized);
  return { account_id: id, email: normalized };
}

/**
 * @param {string} email
 * @param {string} password
 */
async function loginAccount(email, password) {
  const pool = getPool();
  const normalized = email.trim().toLowerCase();
  const [rows] = await pool.execute(
    "SELECT id, password_hash, is_active FROM accounts WHERE email = ? LIMIT 1",
    [normalized],
  );
  const row = rows[0];
  if (!row) {
    const err = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }
  if (!row.password_hash) {
    const err = new Error("This account uses Google or Apple sign-in");
    err.status = 401;
    err.code = "use_social_signin";
    throw err;
  }
  if (!(await bcrypt.compare(password, row.password_hash))) {
    const err = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }
  if (!row.is_active) {
    const err = new Error("Account disabled");
    err.status = 403;
    throw err;
  }
  return { account_id: row.id, email: normalized };
}

/**
 * Lookup for the forgot-password flow. Returns null for unknown emails and
 * for social-only accounts (no password to reset) — callers must not let
 * either case distinguish the response sent back to the client.
 * @param {string} email
 * @returns {Promise<{ id: string } | null>}
 */
async function findPasswordAccountByEmail(email) {
  const pool = getPool();
  const normalized = email.trim().toLowerCase();
  const [rows] = await pool.execute(
    "SELECT id FROM accounts WHERE email = ? AND is_active = 1 AND password_hash IS NOT NULL LIMIT 1",
    [normalized],
  );
  return rows[0] ? { id: rows[0].id } : null;
}

/**
 * Lightweight lookup for the verify-email/resend flow — deliberately not
 * part of the public getProfile() shape consumed by desktop/mobile clients.
 * @param {string} accountId
 * @returns {Promise<{ email: string; emailVerified: boolean } | null>}
 */
async function getAccountEmailVerification(accountId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT email, email_verified FROM accounts WHERE id = ? AND is_active = 1 LIMIT 1",
    [accountId],
  );
  const row = rows[0];
  return row ? { email: row.email, emailVerified: Boolean(row.email_verified) } : null;
}

/**
 * @param {string} accountId
 * @param {string} newPassword
 */
async function setAccountPassword(accountId, newPassword) {
  if (String(newPassword || "").length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    err.status = 422;
    throw err;
  }
  const pool = getPool();
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.execute("UPDATE accounts SET password_hash = ? WHERE id = ?", [passwordHash, accountId]);
}

/** @param {string} accountId */
async function assertAccountActive(accountId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT id FROM accounts WHERE id = ? AND is_active = 1 LIMIT 1",
    [accountId],
  );
  if (!rows.length) {
    const err = new Error("Account inactive");
    err.status = 401;
    throw err;
  }
}

/**
 * Canonical latest-subscription lookup, tolerating the table not existing yet
 * (pre-migration-024 deploys must not break /v1/me).
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} accountId
 */
async function latestSubscriptionForProfile(pool, accountId) {
  try {
    return await latestSubscriptionRow(pool, accountId);
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE") return null;
    throw e;
  }
}

/**
 * @param {{ status?: string } | null} subscription
 * @param {boolean} trialActive
 * @returns {"trial" | "pro" | "past_due" | "canceled" | "expired"}
 */
function computePlan(subscription, trialActive) {
  if (subscription?.status === "past_due") return "past_due";
  if (isEntitledSubscriptionRow(subscription)) return "pro";
  if (trialActive) return "trial";
  if (subscription) return "canceled";
  return "expired";
}

/**
 * Exact-match account lookup (admin support tooling). Includes inactive accounts.
 * @param {string} email already normalized (trimmed, lowercased)
 * @returns {Promise<{ id: string; is_active: number; stripe_customer_id: string | null } | null>}
 */
async function findAccountByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT id, is_active, stripe_customer_id FROM accounts WHERE email = ? LIMIT 1",
    [email],
  );
  return rows[0] ?? null;
}

async function getProfile(accountId) {
  const pool = getPool();
  const [accounts] = await pool.execute(
    "SELECT id, email, first_name, last_name, created_at, trial_ends_at FROM accounts WHERE id = ? AND is_active = 1 LIMIT 1",
    [accountId],
  );
  if (!accounts.length) return null;

  const [profiles] = await pool.execute(
    "SELECT display_name, locale FROM user_profiles WHERE account_id = ? LIMIT 1",
    [accountId],
  );
  const [wallets] = await pool.execute(
    "SELECT bytes_balance FROM wallets WHERE account_id = ? ORDER BY id ASC LIMIT 1",
    [accountId],
  );
  const [ents] = await pool.execute(
    "SELECT feature, source, active, extra FROM entitlements WHERE account_id = ?",
    [accountId],
  );

  const trialEndsAt = accounts[0].trial_ends_at;
  const trialEndsMs = trialEndsAt ? new Date(trialEndsAt).getTime() : null;
  const nowMs = Date.now();
  const trialDaysRemaining =
    trialEndsMs == null ? 0 : Math.max(0, Math.ceil((trialEndsMs - nowMs) / (24 * 60 * 60 * 1000)));
  const trialActive = trialEndsMs != null && nowMs < trialEndsMs;
  const isProductAdmin = await isAccountProductAdmin(accountId);
  const subscription = await latestSubscriptionForProfile(pool, accountId);
  const subscriptionActive = isEntitledSubscriptionRow(subscription);

  return {
    account_id: accounts[0].id,
    email: accounts[0].email,
    first_name: accounts[0].first_name,
    last_name: accounts[0].last_name,
    created_at: accounts[0].created_at,
    trial_ends_at: trialEndsAt,
    trial_days_remaining: trialDaysRemaining,
    trial_active: trialActive,
    is_product_admin: isProductAdmin,
    plan: computePlan(subscription, trialActive),
    subscription_active: subscriptionActive,
    subscription_status: subscription?.status ?? null,
    // Explicit ISO 8601 — clients must never see driver-dependent date shapes.
    subscription_current_period_end: subscription?.current_period_end
      ? new Date(subscription.current_period_end).toISOString()
      : null,
    subscription_cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    profile: profiles[0] || { display_name: null, locale: "en" },
    bytes_balance: wallets[0]?.bytes_balance ?? 0,
    entitlements: ents.map((e) => ({
      feature: e.feature,
      source: e.source,
      active: Boolean(e.active),
      extra: e.extra ? JSON.parse(e.extra) : null,
    })),
  };
}

module.exports = {
  registerAccount,
  loginAccount,
  getProfile,
  findAccountByEmail,
  findPasswordAccountByEmail,
  setAccountPassword,
  getAccountEmailVerification,
  sendVerificationEmail,
  assertAccountActive,
  provisionAccount,
  computePlan,
};
