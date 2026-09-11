/**
 * Authenticated profile writes — display_name + work_role only.
 */

const { getPool } = require("./db");

const WORK_ROLES = Object.freeze(["investing", "sales", "hiring", "founder", "other"]);
const NAME_MAX_LENGTH = 120;
const FORBIDDEN_PATCH_KEYS = Object.freeze([
  "store_billing_exempt",
  "store_checkout_required",
  "entitlements",
  "plan",
  "trial_ends_at",
  "subscription_active",
  "subscription_source",
  "subscription_management",
  "store_subscription_survives_deletion",
]);

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeDisplayName(value) {
  const trimmed = String(value).trim().slice(0, NAME_MAX_LENGTH);
  return trimmed.length ? trimmed : null;
}

/**
 * @param {string} accountId from JWT
 * @param {object} body
 */
async function updateProfile(accountId, body) {
  const patch = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  for (const key of FORBIDDEN_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      throw httpError("invalid_profile_patch", 422);
    }
  }

  const sets = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(patch, "display_name")) {
    if (patch.display_name != null && typeof patch.display_name !== "string") {
      throw httpError("invalid_display_name", 422);
    }
    sets.push("display_name = ?");
    params.push(patch.display_name == null ? null : normalizeDisplayName(patch.display_name));
  }

  if (Object.prototype.hasOwnProperty.call(patch, "work_role")) {
    if (patch.work_role != null && !WORK_ROLES.includes(patch.work_role)) {
      throw httpError("invalid_work_role", 422);
    }
    sets.push("work_role = ?");
    params.push(patch.work_role || null);
  }

  if (!sets.length) return;

  const pool = getPool();
  params.push(accountId);
  try {
    await pool.execute(
      `UPDATE user_profiles SET ${sets.join(", ")} WHERE account_id = ?`,
      params,
    );
  } catch (e) {
    if (e?.code === "ER_BAD_FIELD_ERROR") {
      throw httpError("invalid_work_role", 422);
    }
    throw e;
  }
}

module.exports = { WORK_ROLES, NAME_MAX_LENGTH, updateProfile };
