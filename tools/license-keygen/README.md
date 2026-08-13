# Offline license signing (operators)

The desktop app embeds **only** the Ed25519 **public** key
(`electron/entitlement/embeddedPublicKey.js`, `backend/entitlement_constants.py`, and
`cloud-node/lib/licenseConstants.js`). This folder contains a **signing** helper for internal use.

A license key proves *validity* (signature, tier, seat count) but carries **no machine ID** — it's
unknown at signing time, since the client just pastes the key with zero information exchange.
Device binding happens automatically on **first activation**: the app calls
`POST /v1/licenses/activate` on cloud-node once, silently, the moment a key is pasted and saved.
cloud-node records `(license_id, machine_id)` and enforces `max_seats` from then on
(`cloud-node/lib/licenseActivations.js`). Re-pasting the same key on the same device is always
fine (idempotent); pasting it on one more device than `max_seats` allows is rejected.

## Generate a keypair (one-time)

From the repository root (uses app dependencies):

```bash
node -e "(async()=>{const ed=await import('@noble/ed25519');const sk=ed.utils.randomSecretKey();const pk=await ed.getPublicKeyAsync(sk);console.log('PRIVATE (never commit):',Buffer.from(sk).toString('hex'));console.log('PUBLIC (embed in app):',Buffer.from(pk).toString('hex'));})();"
```

Store the private key in a **password manager** or offline file such as `private-key.hex` (listed in `.gitignore`). Update the public key in:

- `electron/entitlement/embeddedPublicKey.js` — `EMBEDDED_LICENSE_PUBLIC_KEY_HEX`
- `backend/entitlement_constants.py` — `EMBEDDED_LICENSE_PUBLIC_KEY_HEX`
- `cloud-node/lib/licenseConstants.js` — `EMBEDDED_LICENSE_PUBLIC_KEY_HEX` (deploy cloud-node too, or activation of new keys will fail)

Ship a new app build (and redeploy cloud-node) after rotating keys. Old licenses signed with the previous private key will fail verification unless you add multi-key support later.

## Sign a license

```bash
node tools/license-keygen/sign.cjs --private-key /path/to/private-key.hex [--max-seats N]
```

`--max-seats` defaults to `1`. Prints a single-line `exo1....` key to stdout — send it to the
client, they paste it into **Settings → Beta: license & usage** and hit Save. That's it; no ID
exchange, no reply needed from them.

## Distributing to multiple private clients

Run the command above once per client (there's no bulk/batch mode). Since each key isn't tied to
a device at signing time, you can generate keys ahead of time without knowing anything about the
client's machine. Keep a simple local record (e.g. a spreadsheet of client name → key → date
issued) if you need to know later who a key belongs to — cloud-node's `license_activations` table
only stores `license_id` → `machine_id`, not a client name.

## Troubleshooting an activation

If a client reports "already active on another device" (`seat_limit`) unexpectedly — e.g. they
reinstalled on new hardware — there's no self-serve path to release a seat; delete the old row
from `license_activations` (matched by `license_id`, decoded from the key's payload — see
"Payload fields" below) directly in the cloud-node database.

To reproduce their `machine_id` locally for debugging (rarely needed — activation itself already
handles this automatically):

- **Desktop:** run from repo root
  `node -e "console.log(require('./electron/entitlement/machineId').getMachineFingerprint())"`
- **Backend (same value on same machine):**
  `python -c "from machine_fingerprint import machine_fingerprint; print(machine_fingerprint())"`

## Payload fields

The signed JSON includes `product`, `tier`, `license_id`, `iat`, and `max_seats` — no `machine_id`. The app verifies the signature, product, and tier locally on every launch (fully offline); cloud-node additionally verifies the signature server-side once, at activation time, before recording the device.
