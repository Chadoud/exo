# Voice interaction — Exo

Exo supports two ways to talk to the AI assistant over Gemini Live:

## Conversation mode (default)

- Toggle the mic with **F4** or the mic button in AI Manager.
- The session stays open; you can interrupt the assistant by speaking (barge-in).
- Optional **auto-start on launch** opens the mic when the app and backend are ready.
- Startup briefing: on first land (`startup=1`), if a routine exists and consent is not
  `declined`, the server emits `briefing_offer` and asks before any fetch. Sticky
  always (`granted` + `startup_briefing_consent_v2`) auto-runs without asking.
  Legacy sticky `granted` is demoted once to ask-each-session. Client frames:
  `briefing_offer_accept` (this session only), `briefing_offer_skip_session`,
  `briefing_offer_never`, `briefing_offer_always`, `briefing_offer_cancel`,
  `briefing_offer_retry`. See `backend/voice/briefing/offer.py`.

## Push-to-talk mode

- Hold the **talk key** (default: **⌥ Option** on Mac, **Right Alt + Shift + Space** on Windows/Linux).
- Release to send one utterance; stopping mic audio ends the turn (Gemini automatic activity detection).
- On backend-ready land, Exo opens a **muted warm** voice session once so `briefing_offer` can appear without speaking. Mic PCM stays muted until you hold the talk key; the session can stay warm between turns.
- **Double-tap** the talk key quickly to enter locked hands-free mode; tap again to send.
- Settings → Assistant actions → **How you talk to the assistant**.

### Global shortcut (desktop)

When **Talk key when another app is focused** is enabled, Electron registers a `globalShortcut`. Pressing it focuses Exo and starts capture. Release is handled by in-app keyboard listeners once Exo is focused.

### Backend protocol

- Client → server: `{"type":"ptt_end"}` JSON frame on key release (mic PCM stops; no explicit activity signal).
- Server: does not send `ActivityEnd` — Gemini Live automatic activity detection finalizes the turn after silence.

## Clap to open

Optional double-clap wake (Settings) focuses the app. In conversation mode it also starts the mic. In push-to-talk mode use the talk key after the app opens.

## Chat history (voice turns)

Each completed voice turn (`turn_complete`) becomes **one assistant bubble** in AI Manager chat history.

- **No merge across tools** — a WhatsApp confirmation, startup briefing section, and memory save each get their own message.
- **Briefing sections** — while the startup briefing runs, each spoken section is stored separately with `briefingSection` (`news`, `weather`, `calendar`, `mail`) and a shared `briefingRunId`.
- **Legacy repair** — conversations saved before this fix may contain merged blobs; loading them runs a best-effort split on obvious segment boundaries.
- **Live transcript** — `inputTranscript` / `outputTranscript` in the panel are ephemeral; they are committed to history only on `turn_complete`.
- **Quick mic settings** — gear icon beside the mic in AI Manager (and Chat composer) opens the same voice interaction controls as Settings → Assistant actions.
- **Partial STT** — short streaming fragments (e.g. `"Peux-tu"`) are kept while a sentence is in progress; junk filtering runs only when the turn completes. While the AI is speaking, mic audio is pre-rolled so utterance starts are not lost when the echo gate opens. The same pre-roll applies while the WebSocket connects and OAuth tokens relay (~0.5–1 s) so you can speak as soon as you press the talk key. In push-to-talk mode the session stays warm in the background when the backend is ready.

Debug export schema v4 includes `briefingSection` and `briefingRunId` per message.

## Server authority (turn commit)

Voice turn commits are resolved by **`TurnService`** (`backend/services/turn/`) at `turn_complete`. The WebSocket frame may include `serverTurn` with `user_committed`, `user_text`, and `drop_reason`. The client must not re-filter committed user text when `serverTurn` is present.

- Echo/junk/quality rules: `services/turn/echo.py`, `quality.py`, `promise.py`
- Feature flag: `ASSISTANT_TURN_SERVICE` (default on)
- Contract: [ADR-010](adr/010-assistant-voice-turn-contract.md)

Text chat routing uses **`POST /assistant/turn`** (`ASSISTANT_UNIFIED_TURN`). Calendar create/confirm/delete goes through **`CalendarService`** on the server.

**Recurring delete:** when a matched event is part of a series, the server returns `needs_scope` before any mutating API call. Voice and text must capture **this event / this and following / all events** from the user's reply or UI chips — scope is never a Gemini tool parameter. See [`CALENDAR_RECURRING_DELETE_PLAN.md`](CALENDAR_RECURRING_DELETE_PLAN.md).
