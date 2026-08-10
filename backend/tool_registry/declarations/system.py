"""Tool declarations for system."""

from __future__ import annotations

from typing import TYPE_CHECKING

from tool_registry.declarations._common import decl

if TYPE_CHECKING:
    from google.genai import types as genai_types  # type: ignore[import]


def build_declarations() -> list["genai_types.FunctionDeclaration"]:
    return [
                decl(
            "list_directory",
            "List files and folders in a directory under the user's home folder.",
            {"path": {"type": "string", "description": "Absolute path under home"}},
            ["path"],
        ),
                decl(
            "terminal_safe",
            "Run a read-only shell command from a strict allowlist (ls, git status, etc.).",
            {"cmd": {"type": "string"}},
            ["cmd"],
        ),
                decl("get_running_apps", "List running application/process names.", {}),
                decl(
            "system_volume",
            "Set system volume level 0-100 (best-effort per OS).",
            {"level": {"type": "integer"}},
            ["level"],
        ),
                decl(
            "read_file",
            "Read a text file under the user's home directory (size capped).",
            {"path": {"type": "string"}},
            ["path"],
        ),
                decl(
            "open_app",
            "Open an application by path or name.",
            {"target": {"type": "string"}},
            ["target"],
        ),
                decl(
            "close_app",
            "Close/quit a running application by name (e.g. 'WhatsApp', 'Spotify', 'Chrome'). "
            "Use this when the user asks to close, quit, or kill an app.",
            {"app_name": {"type": "string", "description": "Human-readable name of the app to close"}},
            ["app_name"],
        ),
                decl(
            "os_control",
            "Desktop automation: type_text, click, hotkey, scroll, screenshot, close_browser. "
            "Use close_browser to close a Chrome / Firefox / Edge / Brave tab, window, or all instances. "
            "scope='tab' closes one tab (Ctrl+W), scope='window' closes the whole window (Ctrl+Shift+W), "
            "scope='all' kills every process of that browser.",
            {
                "action": {
                    "type": "string",
                    "enum": ["type_text", "click", "hotkey", "scroll", "screenshot", "close_browser"],
                },
                "text": {"type": "string"},
                "x": {"type": "integer"},
                "y": {"type": "integer"},
                "keys": {"type": "array", "items": {"type": "string"}},
                "clicks": {"type": "integer"},
                "path": {"type": "string"},
                "browser": {
                    "type": "string",
                    "enum": ["chrome", "firefox", "edge", "safari", "brave"],
                    "description": "Target browser for close_browser. Default: chrome",
                },
                "scope": {
                    "type": "string",
                    "enum": ["tab", "window", "all"],
                    "description": "tab=close one tab | window=close whole window | all=kill all instances. Default: tab",
                },
            },
            ["action"],
        ),
                decl(
            "plan_and_execute",
            (
                "Autonomously plan and carry out a COMPLEX, MULTI-STEP goal that no single tool "
                "covers. It decomposes the goal into steps, runs them (real tool calls + reasoning), "
                "self-checks each result, and returns a summary. Use this when the user asks for "
                "something that clearly needs several coordinated actions (e.g. 'find my latest "
                "invoice, summarize it, and email the total to my accountant'). For a single tool "
                "action, call that tool directly instead. The reasoning auto-fails-over across your "
                "configured AI providers if one is rate-limited."
            ),
            {
                "goal": {
                    "type": "string",
                    "description": "The full multi-step goal in plain language, with any specifics the user gave.",
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Optional cap on steps (1-12, default 8).",
                },
            },
            ["goal"],
        ),
                decl(
            "start_codegen_studio",
            (
                "Build a real software application — a web app, website, or multi-file "
                "React / TypeScript / HTML / Tailwind project. Opens Codegen Studio, which "
                "generates the project files, installs dependencies, starts a dev server, and "
                "shows a LIVE PREVIEW. Use this whenever the user asks to 'make / build / create "
                "an app, site, page, or tool' (e.g. 'make a social feed app', 'build a todo app'). "
                "Returns immediately and runs in the background — say one short sentence like "
                "'Opening that in Codegen Studio' and do NOT wait for a result. Pass the user's "
                "FULL request as 'goal'. This is NOT plan_and_execute (which cannot build apps) "
                "and NOT dev_scaffold_project (Python-only)."
            ),
            {
                "goal": {
                    "type": "string",
                    "description": "The full app spec in plain language — copy everything the user asked for.",
                },
            },
            ["goal"],
        ),
                decl(
            "review_and_suggest",
            (
                "Proactively suggest what to do next, grounded in the assistant's recent activity "
                "(recent failures and actions). Returns a short list of gated suggestions — it does "
                "NOT perform any action; suggestions that have side effects are flagged as needing "
                "the user's confirmation. Use when the user asks 'what should I do next?', 'any "
                "suggestions?', or after a task to offer sensible follow-ups."
            ),
            {
                "max_suggestions": {
                    "type": "integer",
                    "description": "Optional cap on suggestions (1-5, default 5).",
                },
            },
        ),
                decl(
            "control_computer",
            (
                "Autonomously operate the WHOLE computer to accomplish a high-level task, in ANY "
                "app — not just the browser. It repeatedly looks at the screen, decides the next "
                "action, and performs it (move/click/double-click/right-click, type text, press "
                "keys/shortcuts, scroll) until the task is done. Use this when the user asks you to "
                "DO something on their screen that no specific tool covers — e.g. 'click the blue "
                "button', 'fill in this form', 'turn on dark mode in Settings', 'finish the consent "
                "screen', 'navigate this app for me'. Give a clear, self-contained 'task' describing "
                "the goal and any specifics the user gave (what to type, which option to pick). "
                "It will NOT type passwords/2FA and will stop with status 'needs_user' for sign-in, "
                "captchas, or risky/irreversible actions — tell the user when that happens. Prefer a "
                "dedicated tool (open_app, send_message, youtube_video, manage_connection, etc.) when "
                "one fits; use control_computer for general on-screen tasks."
            ),
            {
                "task": {
                    "type": "string",
                    "description": (
                        "Plain-language goal for what to accomplish on screen, including any "
                        "specifics the user provided (text to enter, the option/button to choose)."
                    ),
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Optional safety cap on actions (1-30, default 20).",
                },
            },
            ["task"],
        ),
                decl(
            "web_agent",
            (
                "Autonomously drive a REAL web browser to accomplish a goal that needs actual "
                "browsing — checking an account/dashboard, reading credits/usage/balance/orders, "
                "looking something up on a specific site, or navigating an interactive page. It "
                "loops: look at the page, decide, click/type/scroll, and read the result. It uses "
                "the user's OWN signed-in Chrome, so it sees the same accounts and logins they "
                "already have — opens the page in your real Chrome (new tab if open, "
                "launches Chrome with the URL if closed; no automation banner). Runs in "
                "the background while you keep talking — say one short sentence like 'Let me check' "
                "and report the result when it finishes. If it needs the user to act — e.g. sign in "
                "at a password / 2FA / captcha wall — it returns status='needs_user' with exactly "
                "what to do; relay that message verbatim. "
                "Prefer this "
                "over web_search whenever the answer lives behind a login or requires interacting "
                "with a page; prefer web_search for quick public facts. Read the result from "
                "data.status: 'done' -> speak data.answer; 'needs_user' -> tell the user to sign in; "
                "'failed'/'incomplete' -> say what blocked it."
            ),
            {
                "task": {
                    "type": "string",
                    "description": (
                        "Plain-language goal for the browser, including any specifics the user "
                        "gave (which site, what to find, what to do)."
                    ),
                },
                "start_url": {
                    "type": "string",
                    "description": "Optional URL to start from when you already know the site.",
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Optional safety cap on actions (1-24, default 16).",
                },
            },
            ["task"],
        ),
                decl(
            "web_search",
            (
                "Search the web and return inline results or a grounded answer to the model. "
                "Use for current events, facts, news, or anything that requires live data. "
                "Optional: max_results (1–10), mode ('web'|'news'), "
                "depth ('answer' for Gemini-grounded reply, 'snippet' for raw DDG hits), "
                "language (BCP-47 tag, e.g. 'fr', 'de')."
            ),
            {
                "query": {"type": "string"},
                "max_results": {
                    "type": "integer",
                    "description": "Number of results to return (1–10, default 8).",
                },
                "mode": {
                    "type": "string",
                    "enum": ["web", "news"],
                    "description": "Search mode: 'web' for general search, 'news' for recent articles.",
                },
                "depth": {
                    "type": "string",
                    "enum": ["answer", "snippet"],
                    "description": (
                        "'answer' returns a grounded Gemini response with citations (preferred); "
                        "'snippet' returns raw result snippets via DuckDuckGo."
                    ),
                },
                "language": {
                    "type": "string",
                    "description": "BCP-47 language/region tag to bias results (e.g. 'fr', 'de', 'en-US').",
                },
            },
            ["query"],
        ),
                decl(
            "browser_control",
            "Control the automation browser: go_to, click, type, get_text, screenshot, etc.",
            {
                "action": {"type": "string"},
                "url": {"type": "string"},
                "selector": {"type": "string"},
                "text": {"type": "string"},
                "query": {"type": "string"},
                "path": {"type": "string"},
                "fields": {"type": "object"},
            },
            ["action"],
        ),
                decl(
            "screen_capture",
            "Capture the user's screen and describe it (requires user approval).",
            {"question": {"type": "string"}},
        ),
                decl(
            "youtube_video",
            "Play, close, or summarize a YouTube video. "
            "ALWAYS extract the song title, artist, or topic from the user's words BEFORE calling — "
            "NEVER call with an empty query_or_url. "
            "Examples: 'play Willy l'ancien' → query_or_url='Willy l ancien', "
            "'put on some jazz' → query_or_url='jazz music', "
            "'find that Frozen song' → query_or_url='Frozen Let It Go'. "
            "Use action='close' to stop/close the YouTube window — no query needed. "
            "action defaults to 'play' when not specified.",
            {
                "action": {
                    "type": "string",
                    "enum": ["play", "close", "summarize"],
                    "description": "play: open a video | close: close the YouTube window/tab | summarize: describe a video. Default: play",
                },
                "query_or_url": {
                    "type": "string",
                    "description": (
                        "Search query (artist, song title, topic) or a YouTube URL. "
                        "REQUIRED for play and summarize — extract it from the user's words before calling. "
                        "Not needed for close."
                    ),
                },
            },
            ["action"],
        ),
                decl(
            "flight_finder",
            "Search Google Flights and summarize options.",
            {
                "origin": {"type": "string"},
                "destination": {"type": "string"},
                "outbound_date": {"type": "string"},
                "return_date": {"type": "string"},
            },
            ["origin", "destination", "outbound_date"],
        ),
                decl(
            "code_runner",
            "Execute approved Python code in an isolated subprocess (requires user approval).",
            {"code": {"type": "string"}, "timeout_sec": {"type": "integer"}},
            ["code"],
        ),
                decl(
            "send_message",
            "Send a message via full desktop automation: opens the app, finds the contact, "
            "pastes the message and presses Enter to send. Supports WhatsApp, Telegram, Signal, "
            "Discord, Instagram, Messenger, email (mailto), and SMS. Falls back to deep links "
            "if automation is unavailable.",
            {
                "platform": {
                    "type": "string",
                    "description": (
                        "Messaging platform: whatsapp | telegram | signal | discord | "
                        "instagram | messenger | email | sms. "
                        "DEFAULT to 'whatsapp' if the user does not specify one — never ask."
                    ),
                },
                "recipient": {
                    "type": "string",
                    "description": "Contact name in the app, @username, phone number (with country code), or email address",
                },
                "message_text": {
                    "type": "string",
                    "description": (
                        "The exact text to send. Extract it from the user's words: "
                        "'say hello' → 'hello', 'tell her good morning' → 'good morning', "
                        "'send him I'm on my way' → 'I'm on my way'. "
                        "NEVER call this tool without message_text — ask for it first if missing."
                    ),
                },
                "mail_subject": {"type": "string", "description": "Subject line (email only)"},
                "prefer_deep_link": {
                    "type": "boolean",
                    "description": "If true, skip desktop automation and open a composer URL instead",
                },
            },
            ["platform", "recipient", "message_text"],
        ),
                decl(
            "weather_report",
            "Current weather summary for a city or coordinates (Open-Meteo).",
            {
                "city": {"type": "string"},
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
            },
        ),
                decl(
            "end_voice_session",
            "End / mute / stop the voice assistant session. "
            "Call this whenever the user says goodbye, hang up, stop listening, "
            "turn off the mic, mute, coupe le micro, arrête d'écouter, "
            "schalte das Mikro ab, spegni il microfono, or any equivalent in any language.",
            {},
        ),
                decl(
            "file_workspace",
            "Create or move files only under the user's home directory.",
            {
                "action": {"type": "string", "description": "mkdir | move | copy | rename"},
                "path": {"type": "string"},
                "destination": {"type": "string"},
                "new_name": {"type": "string"},
            },
            ["action"],
        ),
                decl(
            "analyze_local_file",
            (
                "Read and analyse a file under home and answer a question about it. Uses the same "
                "extraction engine as the Sort feature, so it reads PDFs (including SCANNED ones via "
                "OCR), images, Word/Excel docs and plain text — no Gemini key needed to read the file. "
                "Use this whenever the user asks to read, open, summarise or answer questions about a "
                "specific local file."
            ),
            {"path": {"type": "string"}, "instruction": {"type": "string"}},
            ["path"],
        ),
                decl(
            "start_local_file_sort",
            (
                "Run the app's real Sort/Queue classifier on LOCAL files or folders (same backend as POST /sort). "
                "Use when the user wants to sort, classify, organise/organize, tidy, clean up, or auto-file THEIR "
                "FILES ON THIS MACHINE. NOT for Gmail/Drive-cloud-only workflows — those use google_workspace or "
                "microsoft_graph. Paths must resolve under the user's home directory."
            ),
            {
                "file_paths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Absolute filesystem paths under home (directories are expanded to files like Sort tab)."
                    ),
                },
                "output_dir": {
                    "type": "string",
                    "description": (
                        "Optional organised output root — must stay under home. "
                        "If omitted the app defaults to ~/Documents/EXO Sorted Files."
                    ),
                },
                "auto_apply": {
                    "type": "boolean",
                    "description": "Default true (/sort semantics). False = review-first like POST /analyze.",
                },
            },
            ["file_paths"],
        ),
                decl(
            "run_google_drive_workspace_sort",
            (
                "Start the app's progressive Google Drive sort job (desktop): same Workspace/Sort-tab pipeline "
                "as when the user enables Google Drive in Run sort — imports from My Drive and classifies "
                "(not raw Drive API moves alone). Requires Google connected. Use when the user asks to "
                "sort/classify/file/organise their Drive or \"everything on Google Drive\" — not local-only paths."
            ),
            {},
        ),
                decl(
            "dev_scaffold_project",
            (
                "Create a small Python project folder under ~/.ai-manager/codegen and run main.py "
                "(requires approval). Python-only — for React/TypeScript/web apps use plan_and_execute instead."
            ),
            {
                "description": {
                    "type": "string",
                    "description": "REQUIRED. Full project requirements — copy the user's spec verbatim.",
                },
                "project_name": {"type": "string"},
                "timeout_sec": {"type": "integer"},
            },
            ["description"],
        ),
                decl(
            "computer_settings",
            "Adjust safe system settings (brightness best-effort).",
            {"action": {"type": "string"}, "level": {"type": "integer"}},
            ["action"],
        ),
                decl(
            "desktop_environment",
            "Set desktop wallpaper from an image path under home.",
            {"action": {"type": "string"}, "path": {"type": "string"}},
            ["action"],
        ),
        # ── External source connectors ─────────────────────────────────────
    ]
