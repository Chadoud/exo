# Memory signal quality

**Maintenance:** If you change `signal_quality`, mail sync gates, or memory write paths, update this doc in the same PR.

This map documents how promotional / spam / newsletter content is kept out of durable second-brain state (memories, tasks, digest, recall).

## Principle

**Filter at ingestion, not at display.** Prompts may ask the model to skip noise, but every durable write also passes `signal_quality`.

The Memory **All** filter mirrors prompt visibility — unreviewed noisy auto-memories are triaged via **Needs review** or **Discard promotional suggestions**, not shown as trusted facts.

## Tiers

| Tier | Behavior |
|------|----------|
| **REJECT** | Do not create task/memory |
| **QUARANTINE** | Heuristic ambiguous — **not stored** for auto-ingested chat/meeting/mail/calendar memories |
| **ALLOW** | Store normally as `source=auto`, `reviewed=false` |

Mail-sourced **tasks** require **ALLOW** only (QUARANTINE and REJECT are dropped).

User overrides: Gmail `STARRED` / `IMPORTANT`, Outlook flagged/high importance, manual `save_memory`, consent keys (`startup_briefing_consent`, `startup_routine`, …).

## Visibility thresholds

| Constant | Value | Use |
|----------|------:|-----|
| `AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD` | 0.35 | Hide unreviewed auto-memories from prompts, search, `load_memory`, Memory **All** |
| `AUTO_MEMORY_TRIAGE_MAX_NOISE` | 0.35 | Exclude from Needs review UI (aligned with hidden threshold) |

## Module

- `backend/signal_quality/constants.py` — Gmail noise labels, query exclusions, provenance constants
- `backend/signal_quality/evaluate.py` — `evaluate_text`, `evaluate_gmail_message`, `evaluate_outlook_message`, `evaluate_memory_item`
- `backend/signal_quality/memory_shape.py` — `looks_like_email_subject`, `transcript_promo_density`, `looks_like_inbox_recap`

## Write boundaries

| Source | Gate |
|--------|------|
| `tasks_integration_sync` | Gmail/Outlook mail evaluated before task create; only **ALLOW** tier creates tasks; query excludes promotion categories |
| `mail_initiative` harvest | Unanswered Gmail cards: same `evaluate_gmail_message` **ALLOW** gate + noise query exclusions; metadata only (no body/snippet at rest) |
| `integration_memory_loop` | **No auto-memory from mail**; calendar prep tasks only |
| `memory_extract` | Transcript recap/promo-density skip; subject-line shape reject; post-LLM `evaluate_memory_item` (**ALLOW** only); reject promotional tasks |
| `save_memory` tool | `evaluate_memory_item` (consent keys bypass) |
| `update_memory_by_id` / `PUT /memory/{id}` | Re-evaluates on edit; rejects REJECT tier |
| `update_task` | Re-checks mail tasks when description changes |
| `meeting_store` | Uses `_store_memories(..., provenance=meeting)`; skips promotional action items |
| `format_memory_for_prompt` | Hides archived / high-noise unreviewed rows |
| `memory_search` / `recall_search` | Hides archived and noisy unreviewed auto-memories |
| `daily_digest` | Skips open/done tasks that score as REJECT |
| `tasks_store.list_tasks` | Hides promotional mail-sourced tasks from API lists |
| `tasks_store.create_task` | Rejects new promotional mail tasks at insert (requires **ALLOW** tier for mail sources) |
| `second_brain_cleanup` | Unified `/memory/cleanup-noise` for memories + tasks; optional `include_stale` |
| `memory_recall_signal` | Recall touch, ranking blend, stale cleanup — see `docs/MEMORY_RECALL_SIGNAL.md` |

## Chat distillation (memory_extract)

On conversation idle, the renderer calls `POST /conversations/{id}/distill`.

1. **Transcript gate** — skip all memory extraction when promo line density ≥ 40% or transcript matches inbox-recap shape (many short assistant lines, little first-person user voice).
2. **LLM JSON** — memories and action items extracted with strict prompt.
3. **Per-item gate** — `looks_like_email_subject` + `evaluate_memory_item` (chat provenance: QUARANTINE → REJECT).
4. **Structured logging** — `memory_extract_reject` and `memories_skipped_reason` on the distill report.

## Gmail alignment

Canonical exclusions (same as Sort import + assistant recap):

```
-category:promotions -category:social -category:forums -category:updates -in:spam
```

Labels rejected at ingest: `SPAM`, `TRASH`, `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_FORUMS`.

## Cleanup

- `POST /memory/cleanup-noise` — scan and delete promotional auto-memories **and** mail-sourced tasks
- Memories UI + Tasks sync drawer: shared **Remove promotional content** dialog (dry-run preview, then confirm)
- Memory Overview shows a banner when dry-run finds candidates

## User-facing help

- **All** shows only prompt-visible memories (trusted facts). Noisy auto-suggestions are hidden until reviewed or cleaned up.
- **Needs review** is the triage queue for plausible chat extractions.
- **From chat** labels mean the assistant suggested the fact after a conversation — not synced from Gmail/Outlook.
- Run **Discard promotional suggestions** to remove existing marketing subject lines from Memory.

## Memory origins and Open (schema v5)

Each memory row may store an **origin envelope**:

| Column | Purpose |
|--------|---------|
| `origin_kind` | `gmail_message`, `google_calendar_event`, `conversation`, … |
| `origin_ref` | Stable id, e.g. `google-calendar:cal:{eventId}`, `gmail:mail:{id}`, `conv:{uuid}` |
| `origin_url` | Cached provider deep link (`htmlLink` / `webLink`) when known |
| `origin_label` | Short title shown in UI (event name, email subject) |
| `linked_task_id` | FK to synced task when memory came from calendar prep |

**API:** `GET /memory/{id}/open-target` resolves Open (lazy backfill via matching synced tasks).  
**Tasks:** `GET /tasks/{id}/open-target` — same URL builders for mail/calendar tasks.

Modules: `backend/origin_refs.py`, `backend/memory_origin.py`

## Schema (memory_entries v4)

- `provenance` — `manual` \| `chat` \| `meeting` \| `mail` \| `calendar` \| …
- `noise_score` — 0..1 heuristic score at write time
- `archived_at` — set when soft-archived instead of deleted

## Retain / forget policy (conversations)

**Module:** `backend/signal_quality/retain_policy.py`

Promo/spam stays in `evaluate.py`. Retain policy answers: *is this worth keeping on the brain map / for resume?*

| Tier | Meaning | Map |
|------|---------|-----|
| `forget` | Noise (voice check, agent retry, capability FAQ, empty) | Hidden |
| `archive` | Keep in DB; hide from map (no summary, thin thread) | Hidden |
| `working` | Useful for days (summary + some signal) | Shown if score ≥ 0.55 |
| `durable` | Resume-worthy (memories/tasks, rich summary) | Shown |

**Cascade:** L0 cheap title/summary rules → L1 structure (summary, action items, memory links) → optional mid-band LLM (`EXOSITES_MEMORY_RETAIN_LLM`) → surface filters → cleanup archive/TTL.

| Env | Default | Effect |
|-----|---------|--------|
| `EXOSITES_MEMORY_RETAIN_POLICY` | `1` | Score on write + map filter |
| `EXOSITES_MEMORY_RETAIN_LLM` | `0` | Mid-band LLM judge on distill |
| `EXOSITES_MEMORY_WORKING_DAYS` | `30` | Archive cold unlinked working chats |

Conversation columns: `retain_tier`, `retain_score`, `retain_reasons`, `ephemeral`, `archived_at`, `last_judged_at`, `pinned`.

**Memory adapter:** `memory_entry_to_retain_verdict` maps `noise_score` / `reviewed` / `recall_weight` into the same tier language for metrics. Prompt/search still use `is_prompt_visible` / `is_recall_visible`.

## Tests

- `backend/tests/test_signal_quality.py`
- `backend/tests/test_memory_shape.py`
- `backend/tests/test_memory_extract.py`
- `backend/tests/test_assistant_memory_signal.py`
- `backend/tests/test_second_brain_cleanup.py`
- `backend/tests/test_retain_policy.py`
- `frontend/src/utils/memoryUi.test.ts`
