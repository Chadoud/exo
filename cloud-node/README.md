# EXO Cloud API (Node.js + MariaDB)

Account API for **api.exosites.ch** on Infomaniak shared hosting. Matches the desktop app contract in `electron/cloudAuth.js`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | DB connectivity check |
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | JWT access + refresh tokens |
| POST | `/auth/refresh` | New access token |
| GET | `/v1/me` | Profile + entitlements (Bearer token) |
| POST | `/v1/sort/credentials` | Short-lived sort LLM token for entitled accounts (Bearer token) |
| POST | `/v1/crash-reports` | Ingest opt-in crash reports (`X-Crash-Token`) |
| POST | `/v1/telemetry/events` | Opt-in usage events (optional Bearer) |
| POST | `/v1/telemetry/feedback` | In-app product feedback (optional Bearer) |
| GET | `/v1/public/client-config` | Desktop policy + ingest flags |
| GET | `/v1/public/auth-config` | Which sign-in providers are enabled |
| GET | `/auth/start/:provider` | Begin Google/Apple sign-in (redirects to provider) |
| GET | `/auth/google/callback` | Google OIDC callback |
| POST | `/auth/apple/callback` | Apple `form_post` callback |
| GET | `/auth/done` | Handoff page; desktop reads `exo_code` here |
| POST | `/auth/exchange` | Trade one-time `exo_code` for JWTs |
| GET | `/v1/webhooks/whatsapp` | Meta webhook verification |
| POST | `/v1/webhooks/whatsapp` | Meta inbound message + delivery status |
| POST | `/v1/me/whatsapp/register` | Bind phone number ID to signed-in account |
| GET | `/v1/me/whatsapp/events` | Poll inbound events (desktop sync) |
| GET | `/v1/me/whatsapp/webhook-config` | Callback URL + verify token for Meta setup |

## WhatsApp Business webhooks

Meta pushes inbound messages and delivery receipts to `POST /v1/webhooks/whatsapp`.
The desktop app registers a phone-number binding after saving Business API credentials,
then polls `GET /v1/me/whatsapp/events` and relays them to the local backend.

**Env:** `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (see `.env.example`).

**Migration:** `node scripts/apply-migration-008.js` (included in deploy script).

**Meta app:** callback `https://api.exosites.ch/v1/webhooks/whatsapp`, subscribe to
`messages` and `message_status`.

**Retention:** `WHATSAPP_EVENT_RETENTION_DAYS` (default **30**) — old rows in `whatsapp_events` are purged on webhook delivery and events poll.


New accounts receive `trial_ends_at = UTC now + FREE_TRIAL_DAYS` (default **30**). The desktop app syncs this to local `trial.json` via `GET /v1/me` (`trial_ends_at`, `trial_active`, `plan`).

**Env:** `FREE_TRIAL_DAYS=30` (replaces legacy `FREE_SORT_BYTES`).

**Migrations:**

```bash
node scripts/apply-migration-001.js   # consolidate crash_reports into exo_app
node scripts/apply-migration-002.js   # social sign-in tables
node scripts/apply-migration-003.js   # accounts.trial_ends_at
node scripts/apply-migration-004.js   # GO SYNC relay
node scripts/apply-migration-005.js   # telemetry + feedback + dashboard views
node scripts/apply-migration-006.js   # DataSuite read-only views (PHP dashboard)
node scripts/apply-migration-007.js   # DataSuite insight views (signed-in mix, sparklines)
node scripts/apply-migration-008.js   # WhatsApp webhook bindings + inbound events
node scripts/datasuite-weekly-digest.js   # optional cron — stdout digest
```

Or deploy: `../scripts/deploy-cloud-api.sh` runs migrations 001–008 automatically.

Verify after deploy:

```bash
../scripts/verify-cloud-auth-api.sh
../scripts/verify-product-analytics.sh   # or: npm run verify:product-analytics
```

One-time fix if trials were backfilled as already expired:

```bash
TRIAL_GRANDFATHER_EXPIRED=1 node scripts/apply-migration-003.js
```

## Product analytics

Opt-in usage events and feedback land in **`telemetry_events`** and **`product_feedback`**
(one row per event). Pre-built views (`v_daily_event_counts`, `v_feedback_inbox`,
`v_sort_funnel_7d`, etc.) are created by migration 005.

Retention cron (weekly on Infomaniak):

```bash
node scripts/prune-product-analytics.js 90 365
node scripts/prune-crash-reports.js 90
```

Dashboard queries: `../docs/PRODUCT_ANALYTICS_DASHBOARD.md`

## Crash reports

Crash rows live in the `crash_reports` table of the **same** database (previously a
separate DB). The desktop backend forwards scrubbed payloads here with the shared
`CRASH_INGEST_TOKEN`, so the Node service is the only place holding DB credentials.

To migrate rows from the old standalone database, run
`node scripts/apply-migration-001.js` (or `migrations/001_consolidate_crash_reports.sql`
in phpMyAdmin). Production counts match — **`YOUR_IK_ID_crash_reports` is safe to drop** in Infomaniak.

## Social sign-in (Google / Apple)

One account can sign in with email/password **and** Google **and** Apple — identities are
linked by verified email (see `lib/identities.js`). Each provider is independently optional:
leaving its env vars blank hides the button in the desktop app (`/v1/public/auth-config`).

Flow (no custom URL scheme needed):

1. Desktop opens `/auth/start/:provider` in an app-owned window.
2. Server signs a short-lived `state` (carries the OIDC `nonce`; Google also carries a PKCE
   verifier) and redirects to the provider.
3. Provider redirects back to `/auth/{google,apple}/callback`. Server verifies the `id_token`
   against the provider JWKS, resolves/creates the account, mints a single-use `exo_code`,
   and redirects to `/auth/done?exo_code=…`.
4. The desktop window detects `/auth/done`, then calls `POST /auth/exchange` to swap the
   code for access + refresh tokens. Codes are one-time and expire (`AUTH_EXCHANGE_CODE_TTL`).

Run `migrations/002_auth_identities.sql` in phpMyAdmin to add the tables and make
`accounts.password_hash` nullable. Set the provider env vars (see `.env.example`) and the
redirect/return URLs in the Google Cloud Console and Apple Developer portal:

- Google authorized redirect URI: `${APP_BASE_URL}/auth/google/callback`
- Apple return URL: `${APP_BASE_URL}/auth/apple/callback`

## One-time setup (Infomaniak)

1. **MariaDB** → create database `exo_cloud` → run `schema.sql` in phpMyAdmin.
2. **Node site** `api.exosites.ch` → installation avancée → SSH deploy path noted in Manager.
3. Copy `.env.example` → `.env` with DB credentials + `JWT_SECRET` (`openssl rand -base64 48`).
4. Set the same variables in Infomaniak **Node.js environment** panel (preferred over uploading `.env`).
5. **Cloud sort credentials** — add to the Node.js panel (server-only, never in the desktop app):
   - `SORT_LLM_BASE_URL=https://llm-staging.exosites.ch` (or production `https://llm.exosites.ch`)
   - `LITELLM_MASTER_KEY=<your LiteLLM master key>`
   - Optional: `SORT_LLM_TOKEN_TTL_SECONDS=86400`, `SORT_LLM_ALLOW_MASTER_DELEGATION=0`

After deploy, entitled desktops call `POST /v1/sort/credentials` on sign-in to receive a short-lived token.

## Deploy via SSH

```bash
cp cloud-node/.env.deploy.example cloud-node/.env.deploy
# Edit SSH_USER, SSH_HOST, REMOTE_PATH

chmod +x scripts/deploy-cloud-api.sh
./scripts/deploy-cloud-api.sh
```

Restart the Node app in Infomaniak Manager if needed.

## Enable desktop login gate

Packaged builds only:

```bash
EXOSITES_CLOUD_URL=https://api.exosites.ch
```

Local dev without gate:

```bash
EXOSITES_SKIP_CLOUD_AUTH=1
```

## Local dev

```bash
cd cloud-node
cp .env.example .env
# Point DB_* at local MariaDB or Docker
npm install
npm run dev
```

### Testing Google sign-in against a local server

Google rejects any `redirect_uri` that isn't pre-registered on the OAuth client — a
local `APP_BASE_URL` (e.g. `http://localhost:3000`) produces
`http://localhost:3000/auth/google/callback`, which is **not** the production URI and
fails with `Error 400: redirect_uri_mismatch`.

One-time, permanent fix (safe — additive, doesn't touch production):

1. Google Cloud Console → **APIs & Services → Credentials** → open the same OAuth
   client used in production (`GOOGLE_CLIENT_ID`).
2. Under **Authorized redirect URIs**, add a second entry:
   `http://localhost:3000/auth/google/callback` (Google allows plain `http://localhost`
   as an explicit exception to its HTTPS-only rule).
3. Keep `APP_BASE_URL=http://localhost:3000` in local `.env` so cloud-node derives the
   matching redirect URI automatically.

Apple Sign In has no such exception (return URL must be HTTPS), so it can't be
click-tested against a local server — verify the account-linking logic directly via
`lib/identities.js` (`resolveSocialAccount`) instead, and click-test Apple only against
staging/production.
