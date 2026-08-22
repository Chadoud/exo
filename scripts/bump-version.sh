#!/usr/bin/env bash
# Bump semver across desktop release files. Does not commit or tag.
#
# Usage:
#   ./scripts/bump-version.sh 1.0.0
set -euo pipefail

NEW="${1:-}"
if [[ -z "$NEW" ]] || ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 <semver>   e.g. $0 1.0.0"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node - "$NEW" "$ROOT" <<'EOF'
const fs = require("fs");
const path = require("path");
const version = process.argv[2];
const root = process.argv[3];

function patchJson(rel, fn) {
  const p = path.join(root, rel);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  fn(data);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

patchJson("package.json", (d) => { d.version = version; });
patchJson("frontend/package.json", (d) => { d.version = version; });

const appVersion = path.join(root, "frontend/src/appVersion.ts");
let ts = fs.readFileSync(appVersion, "utf8");
ts = ts.replace(/export const APP_VERSION = "[^"]+";/, `export const APP_VERSION = "${version}";`);
fs.writeFileSync(appVersion, ts);

for (const issRel of ["installer.iss", "installer-test.iss"]) {
  const iss = path.join(root, issRel);
  let issText = fs.readFileSync(iss, "utf8");
  issText = issText.replace(/#define AppVersion "[^"]+"/, `#define AppVersion "${version}"`);
  fs.writeFileSync(iss, issText);
}

console.log(`Bumped desktop version → ${version}`);
console.log(`Next: add ## [${version}] to CHANGELOG.md`);
console.log(`Then: npm run verify:release-version -- --version ${version}`);
console.log(`Then: tag v${version} (stages feed; promote separately)`);
EOF
