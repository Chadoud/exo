# Ship smoke record — 2026-08-17

Living checklist. Update status only: `todo` · `doing` · `pass` · `fail` · `skip`.

**Owner:** Chady  
**Branch:** `main` (ahead of `public/main` by 14 commits)  
**Working tree:** uncommitted **A + B** mixed — not pushed

## Scope (blocked until you pick)

| ID | Slice | Status |
|----|--------|--------|
| S0 | Ship **A+B+G** (voice unmute + Inbox pre-draft + Gmail address on the card) | `pass` — locked 2026-08-17 |

## 0. Preconditions

| ID | Check | Status | Notes |
|----|--------|--------|-------|
| P1 | Real cloud sign-in (not `EXOSITES_INSECURE_LOCAL`) | `pass` | Apple relay account, Free trial, signed in |
| P2 | Gmail connected + **send** (only if B ships) | `pass` | `chadykassab@gmail.com` |
| P3 | Pro + suggest-replies on (only if B ships) | `pass` | Suggest replies checked. Trial-ended banner may still gate send. |
| P4 | Conversation mode, auto-start **off** (once) | `pass` | Conversation, auto-start off |
| G1 | Gmail card shows the **connected mailbox** under the title | `pass` | `chadykassab@gmail.com` |

## 1. Local smoke — voice (A)

| ID | Check | Status | Notes |
|----|--------|--------|-------|
| A1 | Cold launch: briefing card + HUD READY | `fail` | READY + MIC ON. No Yes/Not now card. Trial-ended banner. |
| A2 | Speak — transcript appears and Exo replies | `pass` | “Hey, what time is it?” → “It's 7:35 PM”. Mic stayed listening. |
| A3 | Tap Yes → briefing → then ask something else — reply | `skip` | No briefing card (A1 fail / trial banner) |
| A4 | Tap Not now → talk — reply (no silent empty turns) | `skip` | Same as A3 |
| A5 | No second spoken “want your briefing?” on the card | `skip` | Same as A3 |
| A6 | PTT: silent until key; then hears you | `todo` | |
| A7 | Conversation + auto-start on — still hears you | `todo` | |
| A8 | Barge-in once after briefing | `todo` | |

Unit tests for A already ran in-session (lint/build/794 FE + 24 briefing pytest). That is **not** a substitute for A1–A8.

## 1b. Local smoke — Inbox (B) — skip if A only

| ID | Check | Status | Notes |
|----|--------|--------|-------|
| B1 | Inbox cards only when a saved reply exists | `fail` | Licensed. Honest empty: “No one is waiting on a reply right now.” No Review-reply cards. Badge 3 = 2 failures + memory review. |
| B2 | Review reply opens saved draft immediately | `skip` | Blocked — no Review-reply card (B1). |
| B3 | Edit → confirm → send to the right Gmail thread | `skip` | Same as B2. |
| B4 | Collapse keeps the draft | `skip` | Same as B2. |
| B5 | Promo / noreply / thin thread: no card | `skip` | No harvest cards to judge against. |
| B6 | Suggest-replies off: no harvest cards | `skip` | Already empty with suggest on. |
| B7 | Undo dismiss / restore / multi-select once each | `pass` | Dismiss × works; undo / multi-select works. |
| B8 | Today briefing card: honest empty/loading | `pass` | Open card. Headline: “Nothing due on your calendar or task list today.” Refresh. No Generate / fake counts. |

## 2. Commands before push

| ID | Command | Status |
|----|---------|--------|
| C1 | `cd frontend && npm run lint && npm run build && npm test` | `todo` |
| C2 | `cd frontend && npm run check-locale-keys` | `todo` if B; skip if A only |
| C3 | `cd backend && python -m pytest -q` | `todo` |
| C4 | `npm run test:electron` | `todo` | Electron healthCheck now returns email |
| C5 | Commit (A only or A+B — your call) | `todo` |
| C6 | `npm run verify:local` then push branch/PR | `todo` |

## 3. Staging packaged (not prod feed)

| ID | Check | Status | Notes |
|----|--------|--------|-------|
| T1 | `npm run release:desktop` if tagging `v*` | `todo` | Do not tag until local smoke + C* pass |
| T2 | Install staging DMG / staging update feed | `todo` | Prod `latest.json` must stay old |
| T3 | Repeat A1–A4, **G1**, and B2–B3 on clean install | `todo` | |
| T4 | Packaged: signed-in, mic permission, no insecure-local | `todo` | |

## 4. Production (after Promote desktop feed)

| ID | Check | Status | Notes |
|----|--------|--------|-------|
| R1 | Prod `latest.json` == intended tag | `todo` | |
| R2 | Update or fresh install from **prod** feed | `todo` | |
| R3 | Short path: land → speak → reply | `todo` | |
| R3b | G1: Gmail card shows the right mailbox | `todo` | |
| R4 | If B: one real Review → send you own | `todo` | |
| R5 | Know LKG rollback | `todo` | |

## Deferred (do not block)

- “Not now” returns after reconnect
- Outlook, auto-send, >3 reply cards
- Counsel ack of background harvest timing (B)

## Log

| When | What |
|------|------|
| 2026-08-17 | Tracker opened. Scope unlocked. No local smoke yet. Code uncommitted. |
| 2026-08-17 | **S0 pass:** ship A+B. Next: preconditions P1–P4, then voice A1. |
| 2026-08-17 | Dev `npm run dev` was stopped. Relaunching Electron (working-tree app, not /Applications/Exo.app). |
| 2026-08-17 | First smoke `npm run dev` aborted (~18:00). Relaunched. Still on P1–P4. |
| 2026-08-17 | Gmail card shows connected mailbox (live probe). Refresh External sources to see it. |
| 2026-08-17 | **G1** added to smoke (local + staging + prod). Relaunching dev app so Electron picks up healthCheck email. |
| 2026-08-17 | Dev session aborted (~18:41). Relaunched. Still on G1. |
| 2026-08-17 | **G1 pass.** Next: P1 real cloud sign-in. |
| 2026-08-17 | **P1 pass** (Apple Hide My Email, trial, signed in). Next: P2 Gmail send. |
| 2026-08-17 | **P2 + P3 + G1 pass** (`chadykassab@gmail.com`, suggest replies on). Trial-ended banner visible. Next: P4. Button → Disconnect; removed always-on filters hint. |
| 2026-08-17 | Dev session aborted (~18:58). Relaunched. Still on P4. |
| 2026-08-17 | **P4 pass.** Next: A1 cold launch briefing card. |
| 2026-08-17 | **A1 fail:** READY yes, briefing card no, trial-ended banner. Continue A2 (speak anyway). |
| 2026-08-17 | **A2 pass.** Hear + reply works. A3–A5 skipped (no offer card). Next: Inbox B1. |
| 2026-08-17 | **B1 fail.** Inbox shows 2 old failure cards (warn friends / Talabat filters). No ready-reply section. Next: Pro account to unblock B2–B4, or skip send and do B7/B8. |
| 2026-08-17 | Licensed Inbox UX: collapsed failures + honest replies-empty confirmed. B1 still fail (no Review reply). Next: B8 Today briefing, then B7 undo. |
| 2026-08-17 | Mic Off = session stop (not mute). Cut-off Inbox card “. Yeah, that's” is known. Mic-stop redesign deferred. Next: confirm Mic Off once, then B8, then B7. |
| 2026-08-17 | **B8 pass.** Tasks Briefing open, honest empty headline. User wants Mic Off = mute I/O only, keep activity (deferred). Next: B7. |
| 2026-08-17 | **B7 pass.** Dismiss + undo/multi-select. B2–B6 skip (no harvest cards). Local A+B+G smoke done except A6–A8 deferred. Next: C* if shipping. |
