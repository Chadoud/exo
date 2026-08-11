# Product release checklist

Use this list when publishing a downloadable release (GitHub Release or direct DMG/exe distribution).

**Entitlement model:** 30-day free trial (cloud account), Stripe subscription (CHF 20/month or CHF 200/year, behind `STRIPE_BILLING_ENABLED`), optional offline license key. Billing ops: [runbooks/billing-ops.md](runbooks/billing-ops.md). See [SECURITY.md](../SECURITY.md) and live policies at [exosites.ch/eng/app-privacy](https://exosites.ch/eng/app-privacy).

## Automated QA (before manual smoke)

From the repo root:

```bash
npm run quality
```

Runs frontend lint, build, unit tests (Vitest **and** root `npm run test:electron`), backend pytest, and Playwright E2E. Mirrors CI in [`.github/workflows/build.yml`](../.github/workflows/build.yml).

## Build artifacts

- **Frontend:** `npm run build:frontend` with legal URLs set (see below).
- **Backend onedir:** PyInstaller output staged at `electron/resources/backend/` (Windows, contains `backend.exe`) or `electron/resources/backend-{arch}/` (macOS, contains `backend`).
- **Windows:** `npm run package:win` → `dist-app/` or `dist-installer/` per [`package.json`](../package.json).
- **macOS:** `npm run package:mac` → universal `.dmg` under `dist-installer/`.
- Smoke-test a **clean install**: sign-in → trial countdown → drop folder → classify → review → apply.
- **macOS:** see [MACOS.md](MACOS.md) for Gatekeeper and permissions.

## Build-time env (legal + diagnostics)

Set in `frontend/.env` or CI before `npm run build:frontend`:

| Variable | Purpose |
|----------|---------|
| `VITE_PRIVACY_POLICY_URL` | `https://exosites.ch/eng/app-privacy` |
| `VITE_TERMS_OF_SERVICE_URL` | `https://exosites.ch/eng/app-terms` |
| `VITE_SENTRY_DSN` | Optional crash reporting (users still opt in) |
| `VITE_BETA_FEEDBACK_URL` | Optional external feedback link in Settings → Privacy |

Bump `LEGAL_TERMS_BUNDLE_VERSION` in `frontend/src/constants.ts` (and E2E mirror) when policies change so first-run re-prompts acceptance.

## Code signing

| Tier | Signing | Best for |
|------|---------|----------|
| **A — Fast** | Unsigned | Early adopters who accept SmartScreen / Gatekeeper friction |
| **B — Broad** | Authenticode + Apple notarization | Public download, fewer OS warnings |

See [DISTRIBUTION.md](DISTRIBUTION.md) and [PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md).

## GitHub release

- Tag `vX.Y.Z` after a green **Build Installers** run.
- Attach `.exe` / `.dmg` (or zip) as release assets.
- Use [RELEASE_NOTES_TEMPLATE.md](RELEASE_NOTES_TEMPLATE.md).
- Link to [app-privacy](https://exosites.ch/eng/app-privacy) and [app-terms](https://exosites.ch/eng/app-terms).

## Branch and tag conventions

- `main` is the only trunk, on both repos (`Chadoud/ai-assistant` private, `Chadoud/exo` public mirror). Mobile lives on `main` too — no long-lived feature or platform branches.
- One working copy pushes to both remotes; keep the two `main`s at the same commit (`git push origin main && git push public main`).
- Release tags (`v*`) live on the **public** repo, where CI builds and publishes installers. Do not backfill or bulk-push tags: every `v*` push triggers a full Win + Mac installer pipeline (`.github/workflows/build.yml`).
- Historic pre-copy tags (v1.1.0–v1.1.44) exist only on the private repo; `archive/pre-public-copy-2026-07-23` preserves the pre-mirror history. Leave both alone.
- Short-lived branches only: branch from `main`, merge or delete within days. No `master`, no incubation trunks.

## Cloud accounts (Exosites)

Production builds bundle `EXOSITES_CLOUD_URL` (e.g. `https://api.exosites.ch`) via `electron/resources/integration-config.json`.

1. Deploy cloud-node with migration 003 (`trial_ends_at`).
2. Run `bash scripts/verify-cloud-auth-api.sh`.
3. Optional dev: `EXOSITES_SKIP_CLOUD_AUTH=1` disables the sign-in gate locally.

Users sign in on first launch; trial syncs from `GET /v1/me`. Sorting blocks after trial unless a license key is active.

## QA spot-checks

- Fresh profile: **14-day trial** in Settings, sign-in toast, `TrialEndingBanner` when ≤3 days left.
- Trial expired: sort blocked; Settings → Trial & license accepts offline key.
- **Integrations:** [INTEGRATIONS_QA.md](INTEGRATIONS_QA.md) when shipping OAuth changes.
- Legal links in welcome + Settings open canonical `/eng/app-privacy` and `/app-terms`.

## Licensing ops

- Ed25519 **private** key only in secure storage (`tools/license-keygen/README.md`).
- Rotate public key in app + re-issue licenses when rotating keys.

## After publish

- Monitor optional crash ingest and in-app feedback.
- See [POST_LAUNCH_BETA.md](POST_LAUNCH_BETA.md) for triage workflow (title is legacy; content still applies).
