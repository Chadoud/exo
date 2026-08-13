#!/usr/bin/env node
/**
 * Internal: sign an offline license (exo1.…).
 * Usage (from repo root):
 *   node tools/license-keygen/sign.cjs --private-key path/to/secret.hex [--max-seats N]
 *
 * The key carries no machine_id — it's unknown at signing time, since the
 * client just pastes the key with no prior ID exchange. Device binding
 * happens on first activation, enforced server-side by cloud-node
 * (routes/licenses.js + lib/licenseActivations.js) via `max_seats`.
 *
 * Private key: 32-byte Ed25519 seed as 64 hex chars (never commit).
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const { LICENSE_PREFIX, PRODUCT_SLUG } = require("../../electron/entitlement/constants");

function canonicalLicensePayload(obj) {
  const ordered = {};
  for (const k of Object.keys(obj).sort()) {
    ordered[k] = obj[k];
  }
  return JSON.stringify(ordered);
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function parseArgs(argv) {
  const out = { privateKeyPath: null, maxSeats: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--private-key") out.privateKeyPath = argv[++i];
    else if (a === "--max-seats") out.maxSeats = Number.parseInt(argv[++i], 10);
  }
  return out;
}

async function main() {
  const { privateKeyPath, maxSeats } = parseArgs(process.argv.slice(2));
  if (!privateKeyPath) {
    console.error("Usage: node tools/license-keygen/sign.cjs --private-key <secret.hex> [--max-seats N]");
    process.exit(1);
  }
  if (!Number.isInteger(maxSeats) || maxSeats < 1) {
    console.error("--max-seats must be a positive integer.");
    process.exit(1);
  }
  const raw = fs.readFileSync(path.resolve(privateKeyPath), "utf8").trim();
  const sk = Buffer.from(raw.replace(/^0x/i, ""), "hex");
  if (sk.length !== 32) {
    console.error("Private key must be 32 bytes (64 hex chars).");
    process.exit(1);
  }

  const payload = {
    iat: Math.floor(Date.now() / 1000),
    license_id: crypto.randomUUID(),
    max_seats: maxSeats,
    product: PRODUCT_SLUG,
    tier: "full",
  };
  const canonical = canonicalLicensePayload(payload);
  const message = new TextEncoder().encode(canonical);
  const ed = await import("@noble/ed25519");
  const sig = await ed.signAsync(message, Uint8Array.from(sk));
  const line = `${LICENSE_PREFIX}.${b64url(Buffer.from(canonical, "utf8"))}.${b64url(Buffer.from(sig))}`;
  console.log(line);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
