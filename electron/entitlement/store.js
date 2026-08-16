const fs = require("fs");
const path = require("path");
const { verifyLicenseKey } = require("./verify");
const cloudAuth = require("../cloudAuth");
const { isUnlimitedEntitlementBuild } = require("../buildProfile");
const { syncGoogleOauthClientIdForElectronMain } = require("../backendProcess");
const { getTrialStatus, isTrialActive, syncCloudTrialEndsAt } = require("./trialState");
const { getSubscriptionStatus, syncCloudSubscription } = require("./subscriptionState");
const {
  syncSortCredentialsFromCloud,
  getSortServiceSurface,
  getSortSyncLastError,
} = require("./sortCredentials");

const SORT_CREDENTIALS_REFRESH_SKEW_MS = 5 * 60 * 1000;

function profileRootFor(deviceRoot) {
  return require("../accountProfile").resolveProfileRoot(deviceRoot);
}

function sortCredentialsNeedRefresh(userData) {
  // getSortServiceSurface resolves the active profile root from the device root.
  const surface = getSortServiceSurface(userData);
  if (!surface.sortServiceConfigured) return true;
  if (!surface.sortCredentialsConfigRevision) return true;
  const expiresAt = surface.sortCredentialsExpiresAt;
  if (expiresAt == null) return false;
  return Date.now() >= Number(expiresAt) - SORT_CREDENTIALS_REFRESH_SKEW_MS;
}

function devEntitlementBypassEnabled() {
  const explicit = String(process.env.EXOSITES_DEV_BYPASS_ENTITLEMENT || "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicit)) return true;
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "development";
}

function entitlementPath(userData) {
  return path.join(userData, "entitlement.json");
}

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Pull trial end + subscription state from cloud account and persist locally
 * for the Python backend (trial.json + subscription.json).
 * @param {string} userData
 */
async function syncTrialFromCloudSession(userData) {
  const profile = await cloudAuth.fetchProfile(userData);
  if (profile?.trial_ends_at) {
    syncCloudTrialEndsAt(profileRootFor(userData), profile.trial_ends_at);
  }
  if (profile) {
    syncCloudSubscription(profileRootFor(userData), profile);
  }
  return profile;
}

/** @param {unknown} value */
function trimmedOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Cloud-session slice of the entitlement state, shared by both build profiles:
 * session freshness, profile/trial/subscription sync, sort-credential refresh,
 * display name, and admin flag. Sync failures degrade to cached state.
 * @param {string} userData
 */
async function resolveCloudAccountState(userData) {
  const state = {
    cloudAuthRequired: false,
    cloudLoggedIn: false,
    cloudEmail: null,
    cloudFirstName: null,
    cloudLastName: null,
    isProductAdmin: false,
    sortSyncLastError: null,
  };
  if (!cloudAuth.isAuthGateEnabled()) return state;
  state.cloudAuthRequired = true;

  const sess = await cloudAuth.ensureFreshSession(userData);
  state.cloudLoggedIn = Boolean(sess?.access_token);
  state.cloudEmail = typeof sess?.email === "string" ? sess.email : null;
  if (!state.cloudLoggedIn) return state;

  let profile = null;
  try {
    profile = await syncTrialFromCloudSession(userData);
  } catch (err) {
    console.warn("[entitlement] cloud trial sync failed:", err && err.message);
  }
  if (sortCredentialsNeedRefresh(userData)) {
    try {
      await syncSortCredentialsFromCloud(userData);
    } catch (err) {
      console.warn("[entitlement] cloud sort credentials sync failed:", err && err.message);
    }
  }

  state.cloudFirstName = trimmedOrNull(profile?.first_name) ?? trimmedOrNull(sess?.first_name);
  state.cloudLastName = trimmedOrNull(profile?.last_name) ?? trimmedOrNull(sess?.last_name);
  state.isProductAdmin = Boolean(profile?.is_product_admin);
  state.sortSyncLastError = getSortSyncLastError(userData);
  return state;
}

/**
 * @param {string} userData device userData root (cloud session); profile files use profiles/<id>/
 */
async function getEntitlementState(userData) {
  syncGoogleOauthClientIdForElectronMain();
  const dataRoot = profileRootFor(userData);
  const cloud = await resolveCloudAccountState(userData);

  if (isUnlimitedEntitlementBuild()) {
    const sortSurface = getSortServiceSurface(userData);
    return {
      trialActive: false,
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: 0,
      trialExpired: false,
      ...getSubscriptionStatus(dataRoot),
      licensed: false,
      licenseReason: null,
      unlimitedBuild: true,
      canAnalyze: true,
      canUseProactive: true,
      canUseSync: true,
      hasLicenseKey: false,
      ...cloud,
      ...sortSurface,
    };
  }

  const key = readSavedLicenseKey(userData) || "";
  let licensed = false;
  let licenseReason = null;
  if (key) {
    const v = await verifyLicenseKey(key);
    licensed = v.ok;
    licenseReason = v.ok ? null : v.reason ?? "invalid";
  }

  const trial = getTrialStatus(dataRoot);
  const subscription = getSubscriptionStatus(dataRoot);
  const bypass = devEntitlementBypassEnabled();
  const paidAccess = bypass || licensed || subscription.subscriptionEntitled || trial.trialActive;
  let canAnalyze = paidAccess;
  let canUseProactive = paidAccess;
  const canUseSync = paidAccess;

  if (cloud.cloudAuthRequired && !cloud.cloudLoggedIn && !bypass) {
    canAnalyze = false;
    canUseProactive = false;
  }

  const sortSurface = getSortServiceSurface(userData);

  return {
    ...trial,
    ...subscription,
    licensed,
    licenseReason,
    canAnalyze,
    canUseProactive,
    canUseSync,
    hasLicenseKey: Boolean(key),
    ...cloud,
    ...sortSurface,
  };
}

/** Minimal state when `getEntitlementState` throws — keeps the account gate enabled in the UI. */
function entitlementGateFallback() {
  return {
    trialActive: false,
    trialStartedAt: null,
    trialEndsAt: null,
    trialDaysRemaining: 0,
    trialExpired: true,
    subscriptionActive: false,
    subscriptionStatus: null,
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    subscriptionPlan: null,
    subscriptionEntitled: false,
    licensed: false,
    licenseReason: null,
    canAnalyze: false,
    canUseProactive: false,
    canUseSync: false,
    hasLicenseKey: false,
    cloudAuthRequired: cloudAuth.isAuthGateEnabled(),
    cloudLoggedIn: false,
    cloudEmail: null,
    cloudFirstName: null,
    cloudLastName: null,
    isProductAdmin: false,
    sortSyncLastError: null,
  };
}

function readSavedLicenseKey(userData) {
  const ent = readJsonSafe(entitlementPath(profileRootFor(userData)), { v: 1, licenseKey: null });
  const key = typeof ent.licenseKey === "string" ? ent.licenseKey.trim() : "";
  return key || null;
}

function saveLicenseKey(userData, licenseKey) {
  const p = entitlementPath(profileRootFor(userData));
  const prev = readJsonSafe(p, { v: 1, licenseKey: null });
  const next = { ...prev, v: 1, licenseKey: licenseKey || null };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
}

function clearLicense(userData) {
  saveLicenseKey(userData, null);
}

module.exports = {
  entitlementPath,
  getEntitlementState,
  entitlementGateFallback,
  readSavedLicenseKey,
  saveLicenseKey,
  clearLicense,
  syncTrialFromCloudSession,
};
