# Agent tool threat model

**Source of truth:** [`backend/tool_registry/risk_tiers.py`](../backend/tool_registry/risk_tiers.py)  
**Related:** AutonomyPolicy ([`orchestrator/policy.py`](../backend/orchestrator/policy.py)), approval set (`TOOLS_NEEDING_APPROVAL` ≡ `APPROVAL_TOOLS`).

Prompt injection and compromised chat/voice turns must not silently drive desktop RPA, broad file moves, or mutating connectors. This matrix is the product/security contract for that.

## Tiers

| Tier | Meaning | Gate |
|------|---------|------|
| **SAFE** | Read-only or trivially reversible | Allowed without approval when Autonomy is off |
| **SENSITIVE** | Real-world side effects | Blocked unless Autonomous mode / `allow_sensitive` |
| **APPROVAL** | Explicit user confirm (voice UI / chat) | Denied unless `approval_granted` |
| **BLOCKED** | Never inside an autonomous plan loop | Planner / loop refuses |

Connector tools (`google_workspace`, `browser_control`, …) classify by operation verb: write-like verbs → SENSITIVE; read-only verbs → SAFE. Missing operation → SENSITIVE.

Ready-to-send Gmail replies (`POST /mail/replies/send`) are **not** a tool. They are not on `initiative.suggest`, the nudge bus, chat, voice, `plan_and_execute`, or Always allow. Send is authorized only by a single-use, TTL’d capability token issued on Review; To/thread are server-locked.

## Capability matrix (summary)

| Tier | Tools (from `risk_tiers.py`) |
|------|------------------------------|
| **SAFE** | `list_directory`, `terminal_safe`, `get_running_apps`, `read_file`, `web_search`, `weather_report`, `analyze_local_file`, `screen_capture`, `youtube_video`, `flight_finder`, `review_and_suggest`, `read_project_file`, `list_project_tree` |
| **SENSITIVE** | `os_control`, `control_computer`, `code_runner`, `dev_scaffold_project`, `send_message`, `open_app`, `close_app`, `file_workspace`, `computer_settings`, `desktop_environment`, `manage_connection`, `schedule_reminder`, `save_memory`, `system_volume`, `start_local_file_sort`, `run_google_drive_workspace_sort`, `write_project_files`, connectors + `web_agent` |
| **APPROVAL** | Overlaps heavily with SENSITIVE: GUI control, file workspace, sort start, plan_and_execute, browser/web agent, open/close app, messaging, write connectors, settings/desktop env, code_runner, scaffold, … (full set in `APPROVAL_TOOLS`) |
| **BLOCKED** (plan loop) | `plan_and_execute`, `end_voice_session` |

`screen_capture` is SAFE for AutonomyPolicy classify but still in **APPROVAL** (privacy confirm).

## Residual risk

- Approval UX can be social-engineered; Autonomous mode opts into SENSITIVE without per-call prompts.
- Same-OS-user malware with process/env access bypasses these gates (out of scope — see root [`SECURITY.md`](../SECURITY.md)).
- Sort-tab one-click apply remains a product path (not voice/agent auto-apply).
