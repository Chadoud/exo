#!/usr/bin/env node
/**
 * Release checklist: static security posture gates (M4.4).
 * Exit 0 when all checks pass.
 *
 * Usage: node scripts/verify-security-posture.mjs
 *        npm run verify:security-posture
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  failed += 1;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`${rel} missing`);
    return null;
  }
  return fs.readFileSync(p, "utf8");
}

// 1. risk_tiers.py exists
{
  const rel = "backend/tool_registry/risk_tiers.py";
  const src = read(rel);
  if (src != null) {
    if (
      src.includes("SAFE_TOOLS") &&
      src.includes("APPROVAL_TOOLS") &&
      src.includes("BLOCKED_TOOLS")
    ) {
      ok(`${rel} present with tier sets`);
    } else {
      fail(`${rel} missing expected tier constants`);
    }
  }
}

// 2. voice_ws_auth has no query-token auth path
{
  const rel = "backend/voice_ws_auth.py";
  const src = read(rel);
  if (src != null) {
    const usesQuery =
      /query_params\s*\[\s*["']token["']\s*\]/.test(src) ||
      /query_params\.get\(\s*["']token["']/.test(src) ||
      /\.query(?:_string)?.*token/.test(src) ||
      /token\s*=\s*.*query_params/.test(src);
    const documentsReject = /Query\s+``\?token=``\s+is\s+intentionally\s+unsupported/i.test(
      src
    );
    if (usesQuery) {
      fail(`${rel} still authenticates via query token`);
    } else if (!documentsReject && !src.includes("?token=")) {
      // Soft: prefer explicit reject note; absence of query read is the hard gate.
      ok(`${rel} has no query-token auth path`);
    } else {
      ok(`${rel} has no query-token auth path`);
    }
  }
}

// 3. secretsHandlers always masks (no app.isPackaged gate for raw return)
{
  const rel = "electron/ipc/secretsHandlers.js";
  const src = read(rel);
  if (src != null) {
    const hasMask = src.includes("SECRET_MASK") && /secrets:get/.test(src);
    const packagedGate =
      /isPackaged/.test(src) &&
      (/getSecret\(/.test(src.split("secrets:get")[1] || "") ||
        /return\s+(?:v|value|getSecret)/.test(src));
    // Hard fail: any isPackaged branch that could return raw secrets.
    if (/isPackaged/.test(src)) {
      fail(`${rel} uses app.isPackaged (must always mask for renderer)`);
    } else if (!hasMask || !src.includes("Never return raw secret")) {
      fail(`${rel} does not unconditionally mask secrets:get`);
    } else if (packagedGate) {
      fail(`${rel} packaged gate for raw secret return`);
    } else {
      ok(`${rel} always masks secrets:get`);
    }
  }
}

// 3b. Electron SECRET_MASK === frontend GEMINI_SECRET_MASK (packaged safeStorage placeholder)
{
  const electronRel = "electron/ipc/secretsHandlers.js";
  const frontendRel = "frontend/src/utils/geminiConnection.ts";
  const electronSrc = read(electronRel);
  const frontendSrc = read(frontendRel);
  if (electronSrc != null && frontendSrc != null) {
    const extractMask = (src, name) => {
      // const NAME = "…"  or  export const NAME = "…"
      const re = new RegExp(
        `(?:export\\s+)?const\\s+${name}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`,
      );
      const m = src.match(re);
      return m ? m[1] : null;
    };
    const electronMask = extractMask(electronSrc, "SECRET_MASK");
    const frontendMask = extractMask(frontendSrc, "GEMINI_SECRET_MASK");
    if (!electronMask) {
      fail(`${electronRel} missing SECRET_MASK string literal`);
    } else if (!frontendMask) {
      fail(`${frontendRel} missing GEMINI_SECRET_MASK string literal`);
    } else if (electronMask !== frontendMask) {
      fail(
        `secret mask drift: electron=${JSON.stringify(electronMask)} frontend=${JSON.stringify(frontendMask)}`,
      );
    } else {
      ok(`secret mask parity (${JSON.stringify(electronMask)})`);
    }
  }
}

// 4. authorizedPaths has no blanket home allow
{
  const rel = "electron/authorizedPaths.js";
  const src = read(rel);
  if (src != null) {
    // Blanket allow: isUnder(resolved, home) / startsWith(homedir) as positive grant.
    const blanketHome =
      /isUnder\(\s*resolved\s*,\s*home\s*\)/.test(src) ||
      /isUnder\(\s*resolved\s*,\s*os\.homedir\(\)\s*\)/.test(src) ||
      /resolved\.startsWith\(\s*(?:home|os\.homedir)/.test(src) ||
      /homedir\(\)[\s\S]{0,80}return\s+true/.test(src);
    const documentsNoBlanket = /never merely because it is under \$HOME/i.test(src);
    if (blanketHome) {
      fail(`${rel} still grants paths merely under $HOME`);
    } else if (!src.includes("isSafeUserContentPath")) {
      fail(`${rel} missing isSafeUserContentPath content-read gate`);
    } else if (!documentsNoBlanket) {
      ok(`${rel} has no blanket $HOME allow`);
    } else {
      ok(`${rel} has no blanket $HOME allow`);
    }
  }
}

// 5. Preload must not expose sync pairing key or integration getToken
{
  const rel = "electron/preload.js";
  const src = read(rel);
  if (src != null) {
    if (/syncGetPairingPayload|getPairingPayload/.test(src)) {
      fail(`${rel} still exposes sync pairing payload (master key)`);
    } else if (/integrationGetToken|integration:getToken/.test(src)) {
      fail(`${rel} still exposes integrationGetToken`);
    } else if (!src.includes("syncGetPairingQr")) {
      fail(`${rel} missing syncGetPairingQr`);
    } else if (!src.includes("syncCopyPairingPayload")) {
      fail(`${rel} missing syncCopyPairingPayload (clipboard via main)`);
    } else {
      ok(`${rel} pairing QR + clipboard copy; no payload/getToken to renderer`);
    }
  }
}

// 6. Composer / system reads use content path gate
{
  const dialog = read("electron/ipc/dialogHandlers.js");
  const sys = read("electron/ipc/systemControlHandlers.js");
  if (dialog != null && sys != null) {
    if (!dialog.includes("isSafeUserContentPath") || !sys.includes("isSafeUserContentPath")) {
      fail("dialog/systemControl handlers missing isSafeUserContentPath");
    } else if (/isAttachmentPathTrusted|isUnderHome/.test(dialog + sys)) {
      fail("legacy isAttachmentPathTrusted / isUnderHome still present");
    } else {
      ok("composer + systemControl use isSafeUserContentPath");
    }
  }
}

// 7. DEVICE allowlist: app.getPath("userData") only in known device-scoped modules.
// PROFILE vault data must use accountProfile.resolveProfileRoot / splitRoots.
{
  const DEVICE_USERDATA_ALLOWLIST = new Set([
    "electron/accountProfile.js",
    "electron/main.js",
    "electron/ipc/appHandlers.js",
    "electron/windows.js",
    "electron/telemetryCloudSync.js",
    "electron/telemetryQueue.js",
    "electron/rendererDiagnostics.js",
    "electron/systemCommandAudit.js",
    "electron/autoUpdater.js",
    "electron/clapPrefs.js",
    "electron/pathRegistry.js",
    "electron/authorizedPaths.js",
    "electron/mainProcessDiagnostics.js",
    "electron/integrations/chromeAutopilot.js",
    "electron/billingDeepLink.js",
    "electron/ipc/billingHandlers.js",
  ]);

  const userDataCall = /(?:app\.)?getPath\(\s*["']userData["']\s*\)/;
  const electronRoot = path.join(ROOT, "electron");
  /** @type {string[]} */
  const offenders = [];

  function walkJs(dir, relBase) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules" || name === "dist") continue;
      const abs = path.join(dir, name);
      const rel = path.join(relBase, name).replace(/\\/g, "/");
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        walkJs(abs, rel);
        continue;
      }
      if (!name.endsWith(".js") || name.endsWith(".test.js")) continue;
      const src = fs.readFileSync(abs, "utf8");
      if (!userDataCall.test(src)) continue;
      if (!DEVICE_USERDATA_ALLOWLIST.has(rel)) {
        offenders.push(rel);
      }
    }
  }

  walkJs(electronRoot, "electron");
  if (offenders.length) {
    fail(
      `getPath("userData") outside DEVICE allowlist (use resolveProfileRoot for vault data): ${offenders.join(", ")}`
    );
  } else {
    ok("getPath(\"userData\") confined to DEVICE allowlist");
  }
}

console.log("");
if (failed > 0) {
  console.error(`verify-security-posture: ${failed} check(s) failed`);
  process.exit(1);
}
console.log("verify-security-posture: all checks passed");
process.exit(0);
