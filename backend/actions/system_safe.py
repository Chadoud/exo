"""
Legacy safe commands: listing dirs, read-only terminal, processes, volume, read file.
Extracted from agent.executor for reuse via tool_registry.dispatch.
"""

from __future__ import annotations

import logging
import os
import shlex
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

HOME = Path.home()
MAX_READ_BYTES = 100 * 1024
MAX_TERMINAL_CMD_CHARS = 512
TERMINAL_SAFE_PREFIXES = [
    "ls",
    "dir",
    "pwd",
    "echo",
    "git status",
    "git log",
    "git diff",
    "python --version",
    "node --version",
    "pip list",
    "pip show",
]

# Shell metacharacters that enable command chaining, substitution, or redirection.
# Any of these in a "safe" command means the request is rejected outright, so the
# prefix allowlist below cannot be bypassed via `ls && rm -rf ~` or `echo $(...)`.
_FORBIDDEN_SHELL_CHARS = frozenset(";&|`$><(){}\n\r\0")

_APP_SECRET_NAMES = frozenset(
    {
        "settings_secrets_v1",
        "gmail_oauth.json",
        "sync_master_key.enc",
    }
)


def _home_sensitive_roots() -> list[Path]:
    return [
        HOME / ".ssh",
        HOME / ".gnupg",
        HOME / ".aws",
    ]


def _app_data_roots() -> list[Path]:
    roots: list[Path] = []
    for env_key in ("EXOSITES_USER_DATA", "EXOSITES_DATA_DIR"):
        raw = (os.environ.get(env_key) or "").strip()
        if not raw:
            continue
        try:
            roots.append(Path(raw).expanduser().resolve())
        except (OSError, ValueError, RuntimeError):
            continue
    return roots


def _is_blocked_content_path(resolved: Path) -> bool:
    """Deny home secrets and Electron userData / app secret leaves."""
    for root in _home_sensitive_roots():
        try:
            if resolved == root or resolved.is_relative_to(root):
                return True
        except (ValueError, OSError):
            continue
    for ud in _app_data_roots():
        try:
            if resolved == ud or resolved.is_relative_to(ud):
                return True
        except (ValueError, OSError):
            continue
        # Also block secret basenames if EXOSITES_* is unset but path looks local.
    if any(part in _APP_SECRET_NAMES for part in resolved.parts):
        # Only treat as blocked when under home or absolute app-data style paths.
        try:
            if resolved.is_relative_to(HOME):
                return True
        except (ValueError, OSError):
            pass
    return False


def _resolve_under_home(p: str) -> Path | None:
    """Expand ~ and verify the path resolves under the user's home directory."""
    try:
        resolved = Path(p).expanduser().resolve()
        if resolved.is_relative_to(HOME) and not _is_blocked_content_path(resolved):
            return resolved
    except (ValueError, OSError):
        pass
    return None


def _is_under_home(p: str) -> bool:
    return _resolve_under_home(p) is not None


def validate_safe_terminal_cmd(cmd: str) -> tuple[bool, str]:
    """Validate a terminal command against the read-only allowlist.

    Defense in depth: reject shell metacharacters first (so command chaining and
    substitution are impossible), then require an allowlisted prefix on the
    tokenized command.

    :param cmd: Raw command string from the caller.
    :returns: ``(ok, reason)`` — ``reason`` is empty when ``ok`` is True.
    """
    stripped = cmd.strip()
    if not stripped:
        return False, "Command is empty"
    if len(stripped) > MAX_TERMINAL_CMD_CHARS:
        return False, "Command too long"
    if any(ch in _FORBIDDEN_SHELL_CHARS for ch in stripped):
        return False, "Command contains forbidden shell characters"
    try:
        tokens = shlex.split(stripped, posix=os.name != "nt")
    except ValueError:
        return False, "Command could not be parsed"
    if not tokens:
        return False, "Command is empty"
    lower = stripped.lower()
    if not any(lower.startswith(prefix) for prefix in TERMINAL_SAFE_PREFIXES):
        return False, "Command not in safe allowlist"
    return True, ""


def _is_safe_terminal_cmd(cmd: str) -> bool:
    ok, _ = validate_safe_terminal_cmd(cmd)
    return ok


def list_directory(args: dict) -> dict:
    logger.debug("[action] list_directory called args=%r", args)
    dir_path = str(args.get("path", "")).strip()
    resolved = _resolve_under_home(dir_path) if dir_path else None
    if not resolved:
        return {"ok": False, "error": "Path must be under home directory"}
    try:
        entries = list(resolved.iterdir())
        visible = [entry for entry in entries if not entry.name.startswith(".")]
        visible.sort(key=lambda entry: (not entry.is_dir(), entry.name.casefold()))
        cap = 200
        items = [
            {"name": entry.name, "type": "directory" if entry.is_dir() else "file"}
            for entry in visible[:cap]
        ]
        return {
            "ok": True,
            "data": {
                "path": str(resolved),
                "items": items,
                "truncated": len(visible) > cap,
            },
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def terminal_safe(args: dict) -> dict:
    logger.debug("[action] terminal_safe called cmd=%r", args.get("cmd", ""))
    cmd = str(args.get("cmd", "")).strip()
    ok, reason = validate_safe_terminal_cmd(cmd)
    if not ok:
        return {"ok": False, "error": reason}
    try:
        # Safe to run through the shell only because validate_safe_terminal_cmd
        # has already rejected every metacharacter that could chain commands.
        # Some allowlisted commands (dir/echo on Windows) are shell builtins.
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return {"ok": True, "data": {"output": result.stdout[:4000]}}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Command timed out"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def get_running_apps(_args: dict) -> dict:
    logger.debug("[action] get_running_apps called")
    try:
        if os.name == "nt":
            result = subprocess.run(
                ["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=10
            )
            apps = list(
                {
                    line.strip('"').split('"')[0]
                    for line in result.stdout.split("\n")
                    if line.strip()
                }
            )[:50]
        else:
            result = subprocess.run(
                ["ps", "-eo", "comm"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            apps = list(
                {line.strip() for line in result.stdout.split("\n") if line.strip()}
            )[:50]
        return {"ok": True, "data": {"apps": apps}}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def system_volume(args: dict) -> dict:
    logger.debug("[action] system_volume called args=%r", args)
    level = max(0, min(100, int(args.get("level", 50))))
    try:
        if os.name == "nt":
            subprocess.run(
                ["nircmd.exe", "setsysvolume", str(int(level * 655.35))],
                capture_output=True,
                timeout=5,
            )
        elif os.name == "posix":
            import platform

            if platform.system() == "Darwin":
                subprocess.run(
                    ["osascript", "-e", f"set volume output volume {level}"],
                    capture_output=True,
                    timeout=5,
                )
            else:
                subprocess.run(
                    ["amixer", "-D", "pulse", "sset", "Master", f"{level}%"],
                    capture_output=True,
                    timeout=5,
                )
        return {"ok": True, "data": {"level": level}}
    except Exception as exc:
        return {"ok": True, "data": {"level": level, "warning": str(exc)}}


def read_file(args: dict) -> dict:
    logger.debug("[action] read_file called path=%r", args.get("path", ""))
    file_path = str(args.get("path", "")).strip()
    resolved = _resolve_under_home(file_path) if file_path else None
    if not resolved:
        return {"ok": False, "error": "Path must be under home directory"}
    try:
        if resolved.stat().st_size > MAX_READ_BYTES:
            return {"ok": False, "error": f"File too large (max {MAX_READ_BYTES // 1024} KB)"}
        return {
            "ok": True,
            "data": {"content": resolved.read_text(errors="replace")[:MAX_READ_BYTES]},
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def save_memory(args: dict) -> dict:
    logger.debug("[action] save_memory called args=%r", args)
    from assistant_memory import update_memory
    from signal_quality import SIGNAL_CHECK_BYPASS_KEYS

    category = str(args.get("category", "context"))
    key = str(args.get("key", ""))
    value = str(args.get("value", ""))
    origin_ref = str(args.get("origin_ref") or "").strip() or None
    if not key:
        return {"ok": False, "error": "key is required"}
    origin_fields: dict[str, str | int | None] = {}
    if origin_ref:
        from memory_origin import normalize_distill_origin_ref

        origin_fields = normalize_distill_origin_ref(
            origin_ref,
            label=str(args.get("origin_label") or value[:120] or key[:120]),
        )
    try:
        update_memory(
            category,
            key,
            value,
            source="manual",
            skip_signal_check=key.strip() in SIGNAL_CHECK_BYPASS_KEYS,
            provenance="manual",
            origin_kind=origin_fields.get("origin_kind") or "manual",
            origin_ref=origin_fields.get("origin_ref"),
            origin_url=origin_fields.get("origin_url"),
            origin_label=origin_fields.get("origin_label"),
            linked_task_id=origin_fields.get("linked_task_id"),
        )
        return {"ok": True, "data": {"saved": True, "category": category, "key": key}}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
