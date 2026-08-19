"""HTTP helpers for voice (status, session prime, WS ticket)."""

from __future__ import annotations

import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from entitlement_gate import assert_may_use_proactive
from voice.model import GEMINI_VOICE_MODEL_DEFAULT, resolve_gemini_voice_model
from voice_session_bootstrap import prime_voice_session_provider


class VoiceSessionPrimeBody(BaseModel):
    session_id: str = Field(..., min_length=1)
    provider: str = "gemini"
    model: str = ""
    api_key: str = ""
    base_url: str = ""


def register_voice_http_routes(router: APIRouter) -> None:
    @router.get("/voice/status")
    async def voice_status() -> JSONResponse:
        """Returns whether voice is ready to use (API key present)."""
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        model = resolve_gemini_voice_model()
        return JSONResponse({
            "ready": bool(api_key),
            "model": model,
            "default_model": GEMINI_VOICE_MODEL_DEFAULT,
            "missing": [] if api_key else ["GEMINI_API_KEY"],
        })

    @router.post("/voice/session-prime")
    async def voice_session_prime(body: VoiceSessionPrimeBody) -> JSONResponse:
        """
        Prime provider context for an upcoming voice WebSocket (main process only).

        OAuth tokens are relayed separately via POST /integration/token-relay.
        """
        assert_may_use_proactive()
        prime_voice_session_provider(
            body.session_id,
            {
                "provider": body.provider,
                "model": body.model,
                "api_key": body.api_key,
                "base_url": body.base_url,
            },
        )
        return JSONResponse({"ok": True})

    @router.post("/voice/ws-ticket")
    async def voice_ws_ticket() -> JSONResponse:
        """Mint a one-shot short-lived ticket for voice WebSocket app_auth (M2.3)."""
        from voice_ws_tickets import mint_voice_ws_ticket

        assert_may_use_proactive()
        return JSONResponse({"ok": True, "ticket": mint_voice_ws_ticket()})
