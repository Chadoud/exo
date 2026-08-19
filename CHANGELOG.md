# Changelog

All notable changes to EXO are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.57] - 2026-08-19

### Fixed

- **Packaging:** Do not codesign the `Python.framework/Python` shortcut (or a materialized `Versions/Current` copy). CI was failing with “bundle format is ambiguous” before the staging DMG could publish.

## [1.1.56] - 2026-08-19

### Added

- **To Do:** Ready-to-send Gmail drafts live on the mail’s task card (and a Ready to send lane when there is no task). Opening Tasks harvests inbox threads.
- **Sources:** Connected account email on Gmail, Drive, Calendar, Outlook, OneDrive, Dropbox, and Infomaniak cards.
- **Voice:** Home-folder search from speech; screen capture prefers the Electron permission path.

### Changed

- **To Do:** Removed the Replies tab. Sidebar is Tasks / Needs you / Done. Tasks badge includes unmatched drafts; Done badge refreshes when you complete or reopen a task.
- **Privacy:** “Erase all local accounts” removed; erase this account’s local data remains.

### Fixed

- **Entitlement:** Unpaid voice closes the socket; briefing and send-mail stay off until subscribed. Trial banner only when the trial is actually limited.
- **Needs you:** Drop trash STT failure cards; leftover imported tasks clear when the mailbox changes.
- **Sort:** Job-status toasts no longer stack on refresh failure.

## [1.1.55] - 2026-08-11

### Added

- **Billing:** Stripe subscriptions (CHF 20/month, CHF 200/year) with checkout/portal deep links, entitlement sync, webhook hardening, and nightly reconciliation.
- **Trial:** Freemium limited mode — trial-ended gate is dismissible into limited access with a persistent in-flow upgrade banner; subscribe modal redesigned with plan cards and benefits.
- **Voice:** Mic restart button between mic and settings controls.
- **Admin:** Audited support tooling — account lookup, trial extension, subscription resync (allowlist + audit trail).

### Fixed

- **Voice:** Silent mic denial on macOS — explicitly request TCC microphone access so the system prompt appears.
- **Debug UI:** Product-admin debug tools no longer stay visible after switching to a non-admin account in the same session.
- **Packaging:** Preserve Python.framework symlinks verbatim in onedir staging (codesign "unsealed contents" failure).

## [1.1.54] - 2026-07-17

### Fixed

- **Go-live:** Confirm published app Privacy/Terms (legitimate-interest diagnostics EN/FR; PolyForm source license on terms); close Track B legal checklist.
- **Distribution:** Prefer CI-signed/notarized Mac DMG from the update feed — do not install unsigned `dist-installer/mac/` copies via ditto (silent mic on macOS).
- **Voice:** Ready gate accepts vault-held Gemini key when React settings mask is empty; surface prime/auth failures instead of silent reconnect.
- **Voice tools:** Classify remaining handler dead-zone tools into SAFE/APPROVAL; keep list_tasks callable.

### Changed

- **Release:** Local `release:desktop` / pre-push gate stamp for `v*` tags; remove misleading Gemini “Active” badge (keep Configured).

## [1.1.53] - 2026-07-17

### Fixed

- **CI:** Agent task test accepts `allow_sensitive`; composer PDF extract test mocks ingestor; privacy E2E matches "Erase this account's local data".
- **Release gate:** `release-desktop.sh` runs backend pytest fail-fast before the full quality suite.

## [1.1.52] - 2026-07-17

### Fixed

- **CI:** Re-export `GEMINI_VOICE_MODEL_DEFAULT` from `voice_session` (ruff had stripped it) so backend pytest collection succeeds.

## [1.1.51] - 2026-07-17

### Fixed

- **Voice Live:** Reject non–native-audio Gemini models; treat Live audio-config close (1007) as fatal instead of endless reconnect; surface a clear mic error/toast.
- **Voice tools:** Nested `plan_and_execute` approvals pass through; failed plans speak the summary (not "no detail"); Gemini Live hands heavy plans to Anthropic when configured.
- **Google Calendar after connect:** Relay OAuth tokens to the backend immediately after Settings/Electron connect so the next calendar ask uses the new scopes (not a stale Gmail-only cache).
- **manage_connection:** Included in approval tools so voice can reconnect Google with the Allow prompt.
- **JobStore / backend spawn:** Harden jobs.json atomic save; free port 7799 before respawn to stop address-in-use thrash.
- **Diagnostics:** Benign EPIPE/ECONNRESET no longer loop as background errors.

### Added

- Composer attachment classify/extract path; account profile helpers; calendar-token-after-reconnect and manage_connection approval tests.

## [1.1.50] - 2026-07-16

### Added

- **Desktop update pipeline:** `v*` tags publish installers to the **staging** feed only (`exo-assistant-staging`). Production `latest.json` updates via the **Promote desktop feed** workflow (Environment approval + LKG snapshot/rollback). Version alignment gate: `npm run verify:release-version`.

### Fixed

- **Updater:** Missing Ed25519 (`@noble/ed25519`) in a packaged app no longer surfaces a background-error dialog; update checks soft-fail and retry with backoff. Packaged builds require `@noble/ed25519` in `app.asar` (verified by `package:mac`).

### Changed

- Update checks are deferred after startup, deduped in-flight, use ETag/304 when possible, and back off on network/signature failures.

## [1.1.49] - 2026-07-15

### Security

- **M2.3:** Renderer never receives durable app token or raw secrets; HTTP via main `backend:http`; voice uses short-lived WS tickets; integration tokens relay from main only.
- **M2.4–M2.8:** Gmail mirror wipe on crash/kill/startup leftover; voice rejects `?token=`; cloud session fail-closed without safeStorage; drop legacy plaintext/`*.b64` readers; path grants no longer blanket `$HOME`.
- **M2.9–M2.10:** Drop CORS `"null"`; ignore CORS extras when packaged auth required; rate-limit failed voice WS auth.
- **M3:** AutonomyPolicy + Settings Autonomous mode; centralized risk tiers; expanded approvals; uncertain sort rows default unapproved; code_runner/file_workspace/open_app hardened.
- **M4:** Agent threat model doc, security posture verify script, regression gates.
- **Deploy:** CI downloads publish is SSH-key-only (password/`sshpass` fallback removed).

### Changed

- Voice WebSocket auth and Settings Features toggle for Autonomous mode.

## [1.1.48] - 2026-07-15

### Security

- **Update feed (M1c):** Ed25519-signed `latest.json`; packaged clients reject missing/invalid signatures. Mac in-app self-update requires Developer ID–signed running app.
- **Deploy:** CI prefers SSH key (`EXOSITES_DEPLOY_SSH_PRIVATE_KEY`) for downloads rsync; password/`sshpass` remains fallback.
- **Gemini / voice:** Settings/safeStorage is the connection source of truth (including packaged secret masks); migrate leftover plaintext AI keys into safeStorage on startup.

### Changed

- Publish scripts and tag `publish-website` sign `latest.json` with `UPDATE_FEED_PRIVATE_KEY_HEX` (fail closed if unset).

## [1.1.47] - 2026-07-15

### Security

- **Packaged local API:** Fail-closed app token (`EXOSITES_REQUIRE_APP_TOKEN`); ignore `EXOSITES_INSECURE_LOCAL` in packaged builds; stop writing `.dev-app-token` to disk.
- **Secrets IPC:** Packaged builds return masked values from `secrets:get` (raw keys stay in main / safeStorage).
- **Agent tools:** Expand approval-required tools (computer control, file workspace, voice sort, browser control, etc.); voice `start_local_file_sort` defaults to review-first (`auto_apply=false`).
- **browser_control:** Public-URL SSRF guard on `go_to`; narrow `terminal_safe` (no `cat` / free `npm run`).

### Changed

- **macOS distribution:** First release intended to ship with Developer ID signing + notarization when CI secrets are present.
- **Docs:** Distribution feed documented as `exosites.ch/downloads/exo-assistant`; signing secrets inventory updated.

## [1.1.46] - 2026-07-14

### Fixed

- **CI:** Knip unused exported types in exo visual budget hooks (blocked installer build).

## [1.1.45] - 2026-07-14

### Fixed

- **macOS Google sign-in (dev + exo://):** Dock branding via `ELECTRON_OVERRIDE_DIST_PATH` no longer opens a bare Electron splash on “Open Exo”. A separate `ExoDev` launcher handles cold-start protocol opens while the real `Electron` binary stays intact so preload and Google/Apple buttons keep working.

### Changed

- **Protocol registration:** Documented that macOS ignores Electron’s path/args for `setAsDefaultProtocolClient`; branded app Info.plist now declares the `exo://` URL scheme.

## [1.1.44] - 2026-07-10

### Added

- **App builder:** Diagnoses common build failures (missing packages, syntax, CSS, port conflicts) in plain language and retries repairs with a clear attempt count.

### Changed

- **App builder:** Build status shows only the spinner next to the phase text — no indeterminate horizontal bar.
- **Startup screen:** Logo and **Exo** sit on one row.

## [1.1.43] - 2026-07-10

### Fixed

- **macOS in-app updates:** Bundle `electron-updater` in the packaged app (it was excluded with `!node_modules/**/*`, so “Update now” silently opened the website DMG). CI now verifies the updater is present in `app.asar`. The update button only shows in-app mode when the updater module actually loaded.

## [1.1.42] - 2026-07-08

### Fixed

- **WhatsApp → Connect with Meta:** Exchanges OAuth codes from Meta’s hosted_es callback with the same `redirect_uri` used in the connect dialog — fixes “Error validating verification code / redirect_uri is identical” after “Continue as …”.

## [1.1.41] - 2026-07-08

### Fixed

- **WhatsApp → Connect with Meta:** Captures the OAuth code when Meta closes the “Continue as …” re-auth window (hosted_es callback without redirect_uri). Shows an error toast if connect does not finish instead of failing silently.
- **Tasks (light mode):** “N in inbox need you first” link is readable (uses theme warning color).

## [1.1.40] - 2026-07-08

### Fixed

- **Startup screen:** Shows **Exo** (not “Exo AI”) and uses the same lighter card styling as sign-in — no heavy drop shadow on the logo card.

## [1.1.39] - 2026-07-08

### Fixed

- **Release build:** CI unused-export check (same bits as 1.1.38 — that tag did not ship installers).

## [1.1.38] - 2026-07-08

### Added

- **macOS updates:** After an in-app download finishes, Exo restarts automatically so you always run the new build — no extra “Restart to update” click.
- **Assistant (Gmail):** Batch move and inbox filter tools so the assistant can block senders or move matching mail in one step.
- **Assistant debug export:** Execution trace records tool calls, promise-guard events, and provider errors for support diagnostics.

### Changed

- **Branding:** User-facing copy now says **Exo** instead of **Exo AI** (sidebar, tagline, reminders). Voice commands still accept the old name.

### Fixed

- **Assistant chat:** Replaces unbacked “I’ll do that…” replies with an honest fallback when no tool actually ran (matches voice promise guard).
- **Voice:** Tool-running events can be wired through the session bridge for richer turn tracking.

## [1.1.37] - 2026-07-08

### Fixed

- **Voice after app update:** No longer shows a false “Could not sync your Gemini key” error when the backend already has your key from launch — checks voice readiness before syncing and recovers if sync fails.
- **Voice errors:** “Fix in Settings” now appears on Gemini sync failures and opens **Settings → AI agents → AI provider** (nav label matches the section).

## [1.1.36] - 2026-07-08

### Added

- **Settings → AI provider:** Model picker uses the shared dropdown — choose from available models instead of a plain text field (Custom endpoint still uses free-text model id).

### Fixed

- **Settings → AI provider:** Backup providers (OpenAI, Anthropic, Custom) no longer show “Set as active” or switch your chat provider when configured — saving a key enables failover automatically.
- **Web agent / screen automation:** Vision failover skips providers with invalid API keys or billing errors instead of stopping on a bad Anthropic backup key after Gemini rate-limits.

## [1.1.35] - 2026-07-08

### Added

- **Settings → About & help:** Check for updates — installed version, status, and update action (Mac in-app; Windows opens the signed installer download).

### Fixed

- **macOS in-app updates:** Run `checkForUpdates()` before downloading the zip so updates apply in place instead of falling back to the website DMG.
- **Update modal:** Release notes show plain language (no raw Markdown like `###` or `**`).
- **To Do / mail sync:** Security and login notification emails (e.g. “New sign-in to your OpenAI account”) are no longer imported as tasks.

## [1.1.34] - 2026-07-07

### Added

- **Settings → About & help:** Manual **Check for updates** with installed version and update status (Mac in-app update, Windows opens download page).

### Fixed

- **To Do / mail sync:** Security and login notification emails (e.g. “New sign-in to your OpenAI account”) are no longer imported as tasks.

## [1.1.33] - 2026-07-07

### Fixed

- **Voice / double-clap wake:** Clap-to-wake now unlocks audio after your first click in the app (macOS requires a user gesture), releases the clap-only mic before opening the voice session, and pauses clap listening while the voice mic is active so two streams no longer fight on the same device.

## [1.1.32] - 2026-07-04

### Added

- **Sort workspace:** Pre-sort wizard — pick sources, set folder structure, review, then run. Steps are navigable from the stepper.
- **Settings (dev only):** Toggle to show or hide assistant debug UI on the Exo AI tab.

### Improved

- **After a sort:** Sorted output shows as a folder tree (this run only), matching Results.
- **Review step:** Clearer overview without repeated blocks; structure preview when a template exists.
- **Codegen preview:** Toolbar buttons stay clickable; preview overlay clears after app reload (Cmd+R).
- **Sidebar:** Settings, Memory, and To Do sub-tabs highlight as you scroll; Memory tabs ordered Overview → Map → Activity.
- **Output folder:** Click the output path in the wizard footer to change it.

### Fixed

- **Codegen:** Cancelling a build no longer blocks the next one with “already running”; preview opens when you ask to build an app.
- **CI / quality:** Env-secret audit self-match, cloud sort-credentials test, knip dead-code cleanup, Playwright specs updated for the wizard flow.

## [1.1.31] - 2026-06-29

### Improved

- **First launch (desktop):** Clearer “Starting Exo on this computer” loading state — logo, spinner, and indeterminate progress bar — including on the account gate while the bundled engine prepares.

### Fixed

- **Release build:** Restored macOS `extraResources` in electron-builder config (accidentally dropped in 1.1.31 commit — broke CI packaging).

## [1.1.30] - 2026-06-29

### Fixed

- **First launch (desktop):** Packaged app waits up to ~4 minutes for the bundled engine to start — shows “Starting Exo on this computer…” instead of a false “Exo isn’t ready” error with dev-only pip/uvicorn instructions.
- **Retry during cold start:** Restart no longer kills a backend process that is still unpacking on first launch.
- **Release build:** CI merges connector OAuth keys into `integration-config.json`; macOS packager adds a `python` shim when only `python3` is on PATH.

## [1.1.29] - 2026-06-29

### Fixed

- **Multi-source sort:** Gmail, Google Drive, Dropbox (and other connectors) now run in one job — all source icons show immediately, not only after files import.
- **Cloud sort speed:** Default parallel classify workers raised from 1 to 2 on the VPS gateway.
- **Cloud credentials:** Auto re-sync when sort tokens are near expiry; sync errors surface in the Queue tab.
- **Settings → What Exo uses:** Shows the exact resolved model IDs (`mistral:latest`, `moondream:latest`) and entitled account models via `GET /sort/status`.
- **Retry downloads:** Button only appears when Google Drive is actually a source for the job.

## [1.1.28] - 2026-06-29

### Fixed

- **Cloud sort (VPS):** Signed-in users now auto-sync sort credentials on app startup and entitlement refresh — no need to open Settings first.
- **Voice / chat sort:** Voice-triggered sorts use the VPS gateway when remote mode is active instead of requiring a locally installed Ollama model.
- **Packaged connectors:** Dropbox, Microsoft, and other OAuth client IDs are baked into the installer via `integration-config.json` (run `prepare-release-resources.sh` before every build).

## [1.1.27] - 2026-06-27

### Fixed

- **CI / release:** Knip unused export + backend tests when Ollama model list is empty (fallback to preferred model name at enqueue).

## [1.1.26] - 2026-06-27

### Fixed

- **CI / release:** ESLint hook-deps fix for sort model resolver (unblocks installer build for 1.1.24–1.1.25 fixes).

## [1.1.25] - 2026-06-27

### Fixed

- **File sorting:** Empty sort model no longer reaches LiteLLM as `model=` (HTTP 400). Jobs resolve `mistral` / the first gateway model on the server; the UI sends a resolved model id and auto-selects when Settings left sort model blank.

## [1.1.24] - 2026-06-27

### Fixed

- **Packaged Electron assets:** Voice AudioWorklet and assistant chat brand icons now use relative `publicAssetUrl` paths — fixes mic “Unable to load worklet” and broken Gmail/Outlook logos in chat.
- **Assistant errors:** Chat failures now show the real reason (network, HTTP, 404) and append structured lines to `renderer-diagnostics.log`.
- **macOS DMG:** Taller installer window (440px) so “After installing…” footer copy is visible.

## [1.1.23] - 2026-06-27

### Fixed

- **macOS DMG:** Removed the drawn drag arrow entirely — Retina `@2x` background scaling made the arrowhead huge no matter how small we drew it. Copy-only “Drag to Applications” layout now.
- **Google connect:** Packaged builds now load `client_secret` from bundled `gmail_oauth_client.json`, not only from `.env` — fixes “invalid_request” / missing secret during token exchange.

## [1.1.22] - 2026-06-27

### Fixed

- **macOS DMG:** Smaller drag arrow centered in the icon gap; icon row aligned to y=220 (standard layout) so the arrow no longer overlaps Applications.

### Changed

- **Dependabot:** Removed version-update automation — it only produced failing Actions runs on this monorepo. CVE alerts stay in GitHub Security; `npm audit` still runs in Build Installers.

## [1.1.21] - 2026-06-27

### Fixed

- **First launch:** Stop treating PyInstaller cold start as a service failure — keep the honest “Starting…” overlay until `/health` is up (no false “Local assistant service is not running” on first install).
- **Google connect:** Release builds now require bundled Gmail OAuth credentials; CI fails tag builds without them so Connect Gmail works out of the box.

## [1.1.20] - 2026-06-26

### Fixed

- **CI:** Brain map test fixtures match `BrainFolder` schema; drop unused exported layout type so strict unused checks and TypeScript build pass.

## [1.1.19] - 2026-06-26

### Fixed

- **CI:** Remove unused imports and state after external-source reconnect fix so Build Installers passes frontend lint.

## [1.1.18] - 2026-06-26

### Fixed

- **External sources:** Connect buttons stay clickable after disconnect; status refresh no longer greys out Gmail, Microsoft, Dropbox, and other connectors on transient IPC errors (notably on Windows).
- **Navigation:** Settings, Memory, and To Do parent tabs show all sub-sections on one scrollable page instead of defaulting to a single sub-tab.
- **Brain map:** Folder hubs drag as clusters; child nodes follow; layout persists locally.
- **Sort files:** Output-folder toast appears on first visit to Sort, not during login.
- **Assistant:** Enable actions works when the guided tour is not open.

### Changed

- **Startup overlay:** Honest copy when the local service is still starting (not “first launch takes two minutes” every time).

## [1.1.17] - 2026-06-22

### Changed

- **Guided tour:** Shorter 11-step product tour (was 28); no auto-open on first run — start from Sort strip or Help.
- **Welcome overlay:** Startup copy no longer promises a model list before the local service is ready.

## [1.1.16] - 2026-06-26

### Fixed

- **macOS DMG:** Patch `dmg-builder` so the drag-to-Applications background renders on macOS 15+ (electron-builder #9072).

## [1.1.15] - 2026-06-26

### Fixed

- **macOS universal packaging:** Ship both PyInstaller slices in every arch build and set `x64ArchFiles` so `@electron/universal` keeps them without lipo (per-arch `${arch}` extraResources broke the merge).

## [1.1.14] - 2026-06-26

### Fixed

- **CI:** Backend `/health` smoke test invokes the PyInstaller binary by absolute path (v1.1.10 regressed to `backend: command not found` on Intel runners).

## [1.1.13] - 2026-06-26

### Fixed

- **macOS universal packaging:** Stage backend slices per CPU arch (`backends/${arch}`) so `@electron/universal` merges Intel + Apple Silicon PyInstaller binaries into one `.dmg` instead of dropping them.

## [1.1.12] - 2026-06-26

### Fixed

- **macOS packaging:** Copy `backend-x64` / `backend-arm64` into the universal `.dmg` (electron-builder ignored single-file `extraResources` when a glob `filter` was set).
- **CI:** Verify dual-arch backends from the shipped `Exo.dmg` mount, not intermediate build folders.

## [1.1.11] - 2026-06-26

### Fixed

- **CI:** `installLocation.test.js` is platform-aware on Linux runners (quality-electron gate).

## [1.1.10] - 2026-06-26

### Fixed

- **macOS CI:** Harden backend `/health` smoke tests (random port, logs on failure, longer timeout) and verify dual-arch slices from unpacked `.app` or mounted `.dmg` so universal builds publish reliably.

## [1.1.9] - 2026-06-26

### Fixed

- **macOS Intel:** Universal `.dmg` ships separate `backend-x64` and `backend-arm64` PyInstaller slices instead of a broken `lipo` “universal” backend — local service starts on Intel and Apple Silicon from one download.
- **macOS startup:** Failed backend boot shows recovery UI instead of an infinite “Starting Exo…” spinner; **Restart service** shows progress and stops crash-loop respawns.
- **First-run tour:** Guided tour waits until the local backend is online (no overlap with startup overlay).

### Added

- **macOS install UX:** Custom DMG background (drag-to-Applications) and in-app hint when launched from a mounted disk image.
- **CI:** Smoke-test each backend slice with `/health` before packaging; verify packaged app contains thin x64 + arm64 backends.

## [1.1.8] - 2026-06-26

### Fixed

- **macOS CI:** Skip doomed universal2 + Rosetta x86_64 attempts; always lipo Intel artifact with arm64 backend (~3 min faster, reliable).

## [1.1.7] - 2026-06-25

### Fixed

- **macOS CI:** Build Intel (x86_64) Python backend on `macos-15-intel` and `lipo` with arm64 — fixes failed v1.1.6 release and Intel Mac startup (EBADARCH).

## [1.1.6] - 2026-06-25

### Fixed

- **macOS Intel:** CI no longer ships arm64-only Python backend when universal2 PyInstaller fails — builds x86_64 + arm64 and merges with `lipo` so the backend starts on Intel Macs.
- **Setup → Launch:** Main window opens before the setup window closes so the app no longer quits on `window-all-closed` during first-run launch.

## [1.1.5] - 2026-06-22

### Added

- **GDPR (legitimate interest):** Settings → Privacy objection toggles for usage analytics and crash reports (Art. 21).
- **Data rights:** Settings → Account → **Download my data** (cloud account export as JSON).
- **Account profile:** Display name on sign-up and account settings; cloud migrations 019–020.

### Changed

- Welcome flow accepts Terms/Privacy only — diagnostics disclosed under legitimate interest, not a separate consent toggle.
- `LEGAL_TERMS_BUNDLE_VERSION` bumped to `2026-06-25-gdpr-li` (existing users re-prompted on next launch).
- Account deletion purges linked crash reports and app sessions on the cloud API.
- Published app privacy on exosites.ch aligned with legitimate-interest model.

### Fixed

- Diagnostics preference hydration respects stored opt-out (no longer forced on).

## [1.1.4] - 2026-06-23

### Changed

- CI: full installer builds trigger on `v*` tags only (not every `master` push).
- Release: local publish script and macOS signing identity normalization for electron-builder.

## [1.1.3] - 2026-06-23

### Fixed

- CI: Playwright E2E — privacy settings nav id, Gemini stub key length, brain map API mocks, and updated privacy assertions.

## [1.1.2] - 2026-06-23

### Fixed

- CI: activity capture test no longer imports `pygetwindow` on Linux runners.
- CI: coverage artifact uploads are non-blocking and upload smaller files to avoid Actions storage quota failures.

## [1.1.1] - 2026-06-23

### Changed

- Brain map: open linked files/folders via authorized paths with clear error toasts when unavailable.
- Shell IPC: `openPath` / `showInFolder` / image preview gated on authorized folders instead of legacy trusted-path check.

## [1.1.0] - 2026-06-21

### Added

- **Product analytics (desktop):** Granular sort telemetry — job outcomes (`outcome`, rate buckets), `sort_blocked` reasons, `job_cancelled` vs `job_failed`, review loop events, setup milestones, assistant `intent_bucket`.
- **DataSuite:** Product tab — sort quality, blockers, review funnel, setup milestones, assistant intent. Funnel tab — setup depth waterfall.
- **Cloud:** Migrations 017–018 (`v_sort_health_30d`, `v_sort_blockers_30d`, `v_review_funnel_30d`, `v_setup_milestones_30d`, `v_assistant_intent_30d`).
- Runbook: `docs/runbooks/granular-analytics.md`.

### Changed

- Review dismiss telemetry skips when user bulk-applies (avoids false “left without applying”).
- Output folder and model-ready milestones fire automatically once per install.

## [1.0.0] - 2026-06-16

Production release — desktop 1.0.0, GO SYNC relay, mobile beta track.

### Added

- GO SYNC end-to-end encrypted relay (`/v1/sync/*`) with desktop QR pairing and mobile client.
- Mobile app (Flutter): Today, Memory, Search, Capture stub, Settings with OAuth and pairing.
- Cloud account 14-day trial, social auth (Google + Apple), account deletion API.
- Production ship scripts: `release:cloud-api`, `release:desktop`, `release:mobile`, `verify:ship`.

### Changed

- Desktop version 1.0.0; mobile 0.2.0 internal beta track.
- Legal policies hosted at exosites.ch/eng/app-privacy and /app-terms.

## [0.9.0] - 2026-06-10

First public release (0.9.0).

### Added

- AI file sorting workspace: drop files or folders, get a reviewable sort plan
  with one-line rationales, then apply (copy or move) with full undo history.
- Local-first AI: Ollama models for classification and chat; optional cloud
  providers (Gemini, OpenAI, Anthropic) configurable per feature.
- First-run setup wizard: Ollama install, model download with real progress,
  optional Tesseract OCR, privacy and legal acceptance.
- AI assistant with chat, voice control (double-clap wake), agent tasks with a
  live plan board, and a running-agent roster across tabs.
- External sources: Gmail, Google Drive, Google Calendar, OneDrive, Outlook,
  Dropbox, Notion, Slack, Infomaniak kDrive/Mail — OAuth connect and
  per-source import filters for sort runs.
- Codegen studio: scaffold and preview small web projects from a prompt in a
  sandboxed dev-server preview.
- UI localization: English, French, German, Italian (locale-parity enforced
  in CI).
- Auto-updates from GitHub Releases for packaged builds (Windows and macOS).
- macOS support: universal DMG, hardened-runtime entitlements, Screen
  Recording permission prechecks, backend codesigning hook in the build.

### Security

- Renderer sandbox enabled on all windows; strict IPC sender validation.
- Screen capture gated behind explicit, single-use user consent.
- Codegen install/dev commands restricted to an allowlist with shell
  metacharacter rejection.
- Usage analytics and crash reporting are **off by default** (opt-in during
  setup or in Settings → Privacy), with an allowlisted telemetry schema.

[Unreleased]: https://github.com/Chadoud/ai-file-sorter/compare/v1.0.0...HEAD
[0.9.0]: https://github.com/Chadoud/ai-file-sorter/releases/tag/v0.9.0
