# Analytics event registry

Single reference for product telemetry and crash enrichment fields. When adding events, update **all** layers listed in `.cursor/plans/crash_intelligence_analytics.plan.md` §Schema sync tripwire.

## Client events (`telemetry_events.event_name`)

| Event | When | Key props |
|-------|------|-----------|
| `app_started` | App open | `ui_locale` |
| `feature_entered` | User navigates to tab/feature | `feature`, `tab` |
| `feature_exited` | User leaves feature | `feature`, `dwell_bucket` |
| `assistant_turn_started` | Chat/voice turn begins | `channel`, `intent_bucket` |
| `assistant_turn_completed` | Turn succeeds | `duration_bucket`, `tool_count`, `outcome`, `intent_bucket` |
| `assistant_turn_failed` | Turn fails | `error_class`, `provider`, `intent_bucket` |
| `assistant_tool_invoked` | Backend tool called | `tool_name` |
| `send_message_started` | Messaging tool begins | `platform` (`whatsapp_desktop`, `whatsapp_cloud`, …) |
| `send_message_completed` | Messaging tool OK | `platform`, `method` |
| `send_message_failed` | Messaging tool failed | `platform`, `error_class` |
| `provider_error` | LLM/API error surfaced | `provider`, `error_class` |
| `integration_connect_started` | User starts OAuth/connect | `integration` |
| `integration_connect_completed` | Connect succeeded | `integration` |
| `integration_connect_failed` | Connect failed | `integration`, `error_class` |
| `job_started` / `job_completed` | Sort pipeline | `source`, `file_count_bucket`, `ocr_used`; on complete also `uncertain_rate_bucket`, `failed_sort_bucket`, `failed_fetch_bucket`, `outcome`, `duration_bucket` |
| `job_cancelled` | User stops sort | `follow_up` (`user`) |
| `job_failed` | Pipeline error | `error_class`, `stage` |
| `sort_blocked` | Precondition guard | `reason` (see enums below) |
| `review_opened` | Review panel shown | `file_count_bucket` |
| `review_bulk_applied` | User applies approved moves | `count_bucket` |
| `review_reassign` | Manual folder change | `count_bucket` |
| `review_dismissed` | User leaves review without applying | `file_count_bucket` |
| `sort_structure_enabled` | Sort job started with structure template on | `structure_depth`, `structure_themes`, `has_structure_caps` |
| `sort_structure_cap_applied` | Job finished with cap overflow rewrites | `overflow_count_bucket` (`0`, `1-5`, `6-20`, `21+`) |
| `sort_structure_pack_imported` | User imported a structure pack in Settings | `pack_id` (filename only) |
| `mail_reply_proposed` | Inbox shows a waiting-Gmail card | — |
| `mail_reply_opened` | User taps Review on a waiting-Gmail card | — |
| `mail_reply_sent` | Confirmed send succeeded | — |
| `mail_reply_dismissed` | User dismisses a waiting-Gmail card | — |
| `mail_reply_failed` | Draft or send failed | `error_class` only |
| `codegen_session_start` | Codegen Studio build starts | `follow_up` |
| `codegen_preview_ready` | Live preview reached healthy state | `stack` |
| `codegen_error` | Build/install error or self-correct triggered | `selection` (`install`, `self_correct`), `error_class` |
| `codegen_repair_outcome` | Self-repair loop ended | `outcome` (`fixed`, `failed`), `error_class` |
| `setup_milestone` | First-time setup step (once per install) | `milestone` |
| `account_signed_in` / `account_signed_out` / `account_deleted` | Auth lifecycle | — |
| `telemetry_opt_in` / `telemetry_opt_out` | User re-enabled analytics or **objected** (Settings → Privacy). `telemetry_opt_in` also fires when user turns analytics back on after objection. Not emitted on welcome Terms accept (legitimate interest model). |

## Crash enrichment (`crash_reports` columns)

| Field | Purpose |
|-------|---------|
| `session_id` | Join to telemetry timeline |
| `active_feature` / `active_tab` | Where user was |
| `intent_bucket` | Privacy-safe intent (`messaging_whatsapp`, `sort`, …) |
| `tool_name` | Last tool in flight |
| `crash_signature` | Dedupe hash for triage |
| `dedupe_key` | Client idempotency |
| `last_events_json` | Scrubbed breadcrumb ring (max 30) |

## Enums

**`intent_bucket` (examples):** `messaging_whatsapp`, `messaging_other`, `assistant`, `sort`, `settings`, `unknown`

**`platform` (send_message):** `whatsapp_desktop`, `whatsapp_cloud`, `telegram`, `email`, `other`

**`error_class` (examples):** `429_quota`, `network`, `tool_failed`, `stream_error`, `http_404`

**`error_class` (codegen taxonomy):** `missing_npm_package`, `missing_local_file`, `install_registry_error`, `syntax_error`, `css_tailwind`, `port_conflict`, `unknown`

**`source` (sort jobs):** `local`, `drive`, `gmail`, `mixed`, `unknown`

**`reason` (`sort_blocked`):** `no_output_folder`, `offline`, `model_not_ready`, `entitlement_blocked`, `cloud_auth_required`, `local_paths_need_desktop`, `empty_selection`

**`outcome` (sort quality):** `clean`, `has_uncertain`, `has_failures`, `mixed`

**`milestone` (`setup_milestone`):** `output_folder_set`, `model_ready`, `telemetry_on`, `account_linked`, `welcome_completed`

**Rate/count buckets:** `file_count_bucket` (`1-5`, `6-20`, `21-100`, `100+`); `uncertain_rate_bucket` / `failed_*_bucket` (`0%`, `1-10%`, `11-30%`, `30%+`)

## Breadcrumb shape (`last_events_json`)

```json
[
  { "ts": 1710000000, "type": "tool", "action": "send_message_started", "meta": { "platform": "whatsapp_desktop" } }
]
```

Scrubbed at capture — no paths, prompts, or PII.

## DataSuite views (migrations 012–014)

| View | Tab |
|------|-----|
| `v_crash_inbox_30d` | Quality |
| `v_feature_engagement_30d` | Product |
| `v_assistant_ops_30d` | Product |
| `v_messaging_health_30d` | Product |
| `v_install_health_30d` | Activity (install 360) |
| `v_account_health_30d` | Activity (account 360) |
| `v_sort_health_30d` | Product (sort quality) |
| `v_sort_blockers_30d` | Product (sort blockers) |
| `v_review_funnel_30d` | Product (review loop) |
| `v_setup_milestones_30d` | Product / Funnel (onboarding depth) |
| `v_assistant_intent_30d` | Product (assistant intent) |

## Verify scripts

```bash
bash scripts/verify-crash-ingest.sh
bash scripts/verify-crash-enriched.sh
bash scripts/verify-product-analytics.sh
bash scripts/verify-granular-analytics.sh
VERIFY_AFTER_DEPLOY=1 npm run deploy:datasuite
```
