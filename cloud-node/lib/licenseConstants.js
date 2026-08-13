/**
 * Shared with `electron/entitlement/constants.js` + `embeddedPublicKey.js` and
 * `backend/entitlement_constants.py`. All four must stay identical or the
 * server-side signature check here disagrees with the desktop app's own.
 * Keep in sync when rotating the license signing keypair (tools/license-keygen).
 */

const PRODUCT_SLUG = "exo";
const LICENSE_PREFIX = "exo1";
const EMBEDDED_LICENSE_PUBLIC_KEY_HEX =
  "3cb1b4062885a7ff81e5c6ab0bfd67ed6463acc35f6c8c63561796954a95e126";

module.exports = { PRODUCT_SLUG, LICENSE_PREFIX, EMBEDDED_LICENSE_PUBLIC_KEY_HEX };
