# Paste-ready prompt: Exo AI showcase + Privacy + Terms

Copy everything below the line into a Cursor window opened on the **exosites.ch website** repo.

---

## Task: Rewrite Exo AI showcase + Privacy + Terms

You are editing the **exosites.ch** website. Focus on three deliverables:

1. **Exo AI project showcase page** — friendly, complete, scannable. All features in plain language. No jargon.
2. **`/eng/app-privacy`** (+ **`/fr/app-privacy`** if French pages exist) — all data, OAuth, and technical truth.
3. **`/eng/app-terms`** (+ **`/fr/app-terms`**) — legal agreement, disclaimers, acceptable use.

**Product name:** **Exo** (desktop app). Page title may be **Exo AI**. Site/company: Exosites.

**In-app links (must stay valid):**

- Privacy: `https://exosites.ch/eng/app-privacy`
- Terms: `https://exosites.ch/eng/app-terms`
- French: `/fr/app-privacy`, `/fr/app-terms`

**Account API (not the showcase URL):** `https://api.exosites.ch` — sign-in and licensing only.

---

## Golden rule: what goes where

| Showcase page | Privacy policy | Terms of service |
|---------------|----------------|------------------|
| What the user gets | What data we touch | Legal contract |
| One-line benefits | When we access Google/Microsoft/etc. | Warranties, liability, termination |
| “Connect Gmail to sort attachments” | Exact scopes + Google Limited Use + disconnect steps | AI output disclaimer |
| “Optional daily briefing” | What briefing reads when accounts are connected | Restrictions on misuse |
| “14-day free trial” (brief) | What account data we store on our server | Fees, license, eligibility |
| Link: “How we handle your data →” | Telemetry/crash **on by default** (opt out in Settings), retention, rights | Acceptable use |

**Remove from the showcase:**

- OAuth scope URLs, PKCE, API names, loopback, Sentry, SQLite, token storage mechanics
- Long privacy paragraphs (2–3 bullets + link is enough)
- Legal disclaimers beyond one short line + link to Terms
- Developer setup (ffmpeg paths, Whisper weights, env vars)
- Confidence scores, model names as selling points (say “runs on your computer”, not “7B Ollama”)

**Keep on showcase (short):**

- “Files stay on your computer by default”
- “Cloud AI and connectors are optional — you turn them on”
- “Analytics and crash reports are off until you opt in”
- Clear **Privacy** and **Terms** links in header/footer and in the Google verification block

---

## Google OAuth verification (must pass)

Near the **top** of the Exo AI showcase page:

- **H1 must include the app name:** `Exo` (e.g. “Exo — AI file manager for Mac and Windows”)
- **Purpose paragraph (plain English):** Exo is a desktop app that helps you organize files with AI, chat with an assistant, and optionally connect Gmail, Google Drive, and Google Calendar when **you** choose to.
- **Prominent link** to Privacy Policy (`/eng/app-privacy`)
- This page URL should work as the OAuth consent screen **Application home page** (not bare `exosites.ch` unless the homepage also states purpose and “Exo”)

Use **Exo** consistently user-facing (avoid mixed names like “EXO File Manager” vs “Exo AI Manager”).

---

## Tone and style (showcase)

Write for someone with a messy Downloads folder, not a developer.

- Short sentences. One idea per bullet.
- Outcomes, not mechanisms: “Each file shows where it should go and why” — not “classification pipeline”.
- No ML jargon: no “confidence”, “tokens”, “embeddings”, “RAG”, “agentic loop”.
- Active voice: “Drop files in” not “Files may be ingested”.
- If existing copy is long or repetitive, **cut it**; merge duplicates; prefer bullets over paragraphs.

---

## Showcase page structure

### 1. Hero

- Headline with **Exo**
- Subhead: *Every file lands in the right folder — without you doing the work.*
- One sentence: local desktop app for Mac and Windows; optional cloud connections.
- CTA: Download + link to Privacy
- **One primary media placeholder** (video or screenshot slot) — see Media section below; hero uses the **Smart sort** or **Assistant** hook (pick the stronger visual)

### 2. How it works (3 steps)

1. Install and pick your AI setup (works offline on your Mac/PC).
2. Drop files — or pull from connected mail and drive — into the same sort flow.
3. Review suggestions (each with a plain reason), apply in one click, undo anytime.

### 3. Everything in Exo (complete feature list — text only, grouped)

Every item below must appear in copy somewhere. Group under subheadings; do not skip items.

#### Smart sort (one section — local + cloud are the same flow)

Sorting is **one product**: review, reasons, apply, and undo are identical whether files come from your computer or from a connected account.

- Sort queue for local files (PDFs, Office docs, images, scans)
- Pull into the **same sort** from **Gmail**, **Google Drive**, **OneDrive**, **Outlook mail**, **Dropbox**, **Infomaniak kDrive**, **Infomaniak Mail** (Workspace / Run sort)
- Plain-language reason for each proposed folder
- Review table — fix odd ones, bulk-apply the rest
- Undo moves
- Output folder you choose
- Sort history
- Automation presets (describe outcomes in user terms: careful / balanced / fast — not internal enum names)
- Custom sort instructions in plain language
- Classification rules and rule packs (import/export)
- OCR for scans; vision for photos and image PDFs
- Video sorting (when ffmpeg is available on the machine)
- Multi-language UI (English, French, German, Italian)
- Export sort plan / results where the app supports it

#### Assistant

- Chat with your assistant
- Voice: push-to-talk, conversation mode, clap-to-talk
- Optional offline speech model (“prepare offline model” in settings)
- **Agent mode** — multi-step tasks with a **live plan board**
- Allowlisted **app actions** (open apps, navigate the app, etc.) — enabled in Settings; sensitive actions ask for confirmation
- Tool catalog — enable/disable specific actions
- Assistant sees active sort **status** (not sneaky upload of your files)
- Optional **Gemini** (or other API keys you provide) for chat/voice — separate from local sort model

#### Memory, Today & second brain

- **Memory** — facts the assistant keeps (review, edit, delete)
- **Today** — briefing, tasks, and sync glance
- **Daily briefing** on startup (optional): news, weather, calendar, mail highlights when connected
- **Record meeting** — hands-free meeting notes
- **Activity timeline** (opt-in): activity summarized to one-line notes; screenshots not kept
- **Brain map** — how memories, tasks, and conversations connect
- **Recall / search your brain** — search across memories and past context
- **Encrypted sync** — memories and tasks across devices (trial/Pro; encrypted end-to-end)

#### Connect when you need it

One line each; no deep dive on the showcase:

- Google: Gmail, Drive, Calendar
- Microsoft: OneDrive, Outlook mail
- Dropbox · Notion · Slack · Amazon S3 · iCloud
- Infomaniak: kDrive, Mail, Calendar

(Calendar connectors power briefing and assistant — not a separate “sort from calendar” feature.)

#### Account (text only — no media)

- 14-day full trial · license key · sign in with email, Google, or Apple
- One sentence each; link to Privacy for data details

#### Trust (short — details in Privacy)

- Processing on your device by default
- Connectors and cloud AI only when you enable them
- Usage analytics and crash reports **off until you turn them on**
- Links: Privacy · Terms

### 4. Connect your accounts (optional short paragraph)

Connect mail, drive, or calendar so Exo can sort attachments, power your briefing, or help the assistant — disconnect anytime in the app. **Details → Privacy.**

### 5. Download (text only — no media)

Windows 10/11, macOS 12+. Brief note on unsigned installer if applicable + link to install help. No technical deep dive.

---

## Media & video placeholders (cool features only)

Add visual placeholders for **showcase impact**, not for every bullet. **Do not** add media for Account, Privacy, Trust, or Download sections.

**Placeholder spec (until real assets exist):**

- Aspect ratio: **16:9** for feature clips; optional **4:3** for tight UI crops
- Each block: **label** + **one-line caption** + slot marked `Video or screenshot coming soon` (FR equivalent on `/fr/`)
- Optional static mock (blurred UI silhouette or icon) — **no fake play progress or synthetic loading bars**
- Alt text describes what the final asset will show (accessibility)
- Do not embed heavy video files in repo — use poster images or CMS upload slots; `<video poster="…">` when wired later

**Exactly these placeholders (5–6 max):**

| # | Section | Show | Caption idea |
|---|---------|------|--------------|
| 1 | **Smart sort** | Queue → reason per file → bulk apply / undo | “Same flow from your computer or connected mail & drive.” |
| 2 | **Assistant** | Chat + mic + **live plan board** during agent task | “Talk or type; watch multi-step tasks run.” |
| 3 | **Today & briefing** | Today tab + optional startup briefing | “Your day at a glance.” |
| 4 | **Record meeting** | Start meeting → notes / tasks | “Hands-free meeting notes.” |
| 5 | **Brain map & recall** | Map view + search | “See and search what your assistant remembers.” |
| 6 | **Connect** *(optional)* | External sources grid | “Hook up Gmail, Drive, Outlook, and more when you want.” |

**Hero:** reuse placeholder #1 (Smart sort) or #2 (Assistant) — not both in hero and again immediately below unless layouts differ (hero = wide, section = detail crop).

**No placeholders for:** activity timeline, rule packs, encrypted sync, settings, trial/license, installer, legal pages.

When real screen recordings exist, replace placeholders without changing section order or body copy.

---

## Rewrite Privacy Policy (`app-privacy`)

Accurate, readable, legally complete. Plain-language intro, then structured sections. **All complexity from the old showcase lives here.**

**Must include:**

1. **Who we are** — company name and contact (placeholders OK if not finalized).
2. **Plain summary (≤5 bullets)** — local-first; usage analytics and crash reports on by default (opt out in Settings); Google only when you start a flow; disconnect anytime; we don’t sell your data.
3. **Google API Services User Data Policy / Limited Use** — dedicated subsection:
   - Exo’s use of Google user data limited to user-facing features (sort Gmail/Drive, calendar for briefing/assistant).
   - No selling, no ads, no training generalized models on Google user data.
   - Human access only with consent, for security, or legal requirement.
   - Link: https://developers.google.com/terms/api-services-user-data-policy
4. **Google scopes (plain language table)** — map each to user-visible feature:
   - Gmail read/modify/label/move — sort mail attachments, assistant mail tools
   - Gmail send — when you ask the assistant to send mail, **or** when you confirm Send on a ready-to-send Inbox reply (never auto-send)
   - Ready-to-send Gmail replies (desktop Tasks → Inbox): background harvest reads **metadata only** (thread ids, From/Subject). Cloud AI sees the full thread **only after Review**. A reply is sent **only after** you confirm Send.
   - Drive — list/import/sort/move files you choose
   - Calendar read + events — briefing and calendar-aware assistant actions
5. **Other integrations** — Microsoft Graph, Dropbox, Notion, Slack, S3, iCloud, Infomaniak: what’s stored (tokens on device), when accessed, staging files for sort.
6. **Local processing vs cloud AI** — local model on device; optional API keys to third-party providers per your settings.
7. **Account service (`api.exosites.ch`)** — email, auth, entitlement, optional crash ingest; not your file contents.
8. **Telemetry & crash reports** — opt-in, coarse events, no file paths in analytics; crash reporting when enabled.
9. **Memory, activity timeline, sync** — what’s stored, encryption for sync, activity opt-in and screenshot deletion.
10. **Retention & deletion** — tokens until disconnect; staging until job done; how to delete account / request data.
11. **Your rights** — access, delete, export; EU/UK/US pointers as applicable.
12. **Children, changes, contact.**

Privacy reads like a policy, not a landing page. No duplicate marketing feature list.

---

## Rewrite Terms (`app-terms`)

Standard legal structure with **one plain-language sentence** before each major section.

**Must include:** acceptance; eligibility; what the Service is; license and trial/license key; **AI disclaimer** (suggestions can be wrong; user reviews before acting); user content; third-party services; acceptable use; disclaimers and limitation of liability; termination; changes; governing law `[PLACEHOLDER]`; contact.

Cross-link Privacy. Do not duplicate the full feature list.

---

## French pages

If `/fr/` routes exist: mirror structure and meaning in clear French. Same URL pattern for in-app links.

---

## Editing checklist

1. Open existing **Exo AI** showcase and both legal pages.
2. **Replace** verbose showcase copy — do not stack new layers on old text.
3. **Smart sort** is one section (local + Workspace/cloud); do not split into two product areas.
4. Every feature in “Everything in Exo” appears in **text**; only **5–6 cool placeholders** get media slots.
5. No OAuth scope strings or API jargon on the showcase.
6. Footer/header: Privacy, Terms, Exo AI showcase.
7. Preserve CMS/layout/components unless needed for readability.

**Self-check before done:**

- [ ] H1 contains “Exo”
- [ ] App purpose visible above the fold
- [ ] Privacy link prominent (Google verification)
- [ ] Smart sort covers local + mail/drive in one narrative
- [ ] All integrations listed in text
- [ ] Agent mode + plan board mentioned
- [ ] Activity timeline marked opt-in in text
- [ ] Google Limited Use in Privacy only (one-line pointer on showcase OK)
- [ ] Media placeholders only for table above — not Account/Download/Privacy
- [ ] No duplicate privacy wall on showcase

---

## Reference facts (Privacy accuracy only — do not put on showcase)

- Desktop Google OAuth scopes: `gmail.modify`, `gmail.send`, `gmail.settings.basic`, `drive`, `calendar.readonly`, `calendar.events`
- Cloud sign-in: `openid`, `email`, `profile`
- Gmail/Drive access triggered by user flows, not background scanning — except optional ready-to-send Gmail replies (default on when Pro + Gmail send scope): periodic **metadata-only** inbox checks; full body to cloud AI only on Review; send only on confirm
- Telemetry/crash: **on by default** after Terms acceptance (desktop); opt out in Settings → Privacy & diagnostics
- Activity timeline: opt-in; screenshots → one-line summaries; images deleted
- Sync: end-to-end encrypted memories/tasks; server cannot read plaintext

Do not invent features not listed above. Do not claim Spotify integration (only “open app by name” in assistant actions).

**Output:** Implement copy and placeholder slots in the repo; summarize what changed on each page.
