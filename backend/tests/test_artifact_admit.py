"""Admit door: artifact contracts, not create/build/make vocabulary."""

from __future__ import annotations

from actions.start_codegen_studio import start_codegen_studio
from services.assistant.turn import handle_assistant_turn
from services.routing import (
    RouteContext,
    admit_proposed_tool,
    get_capability_router,
    infer_wanted_artifact,
)
from services.routing.artifact_admit import LastRefusal


def test_infer_debug_export_video_asks() -> None:
    assert infer_wanted_artifact("I need to create videos for social media.") == "video"
    assert infer_wanted_artifact("how can I create a video for social media apps") == "advice"
    assert infer_wanted_artifact("No, where is the fucking video you said you would make?") == "status"
    assert infer_wanted_artifact("Bro, it's not a fucking code that you need from. It's a video.") == "video"


def test_infer_real_app_builds() -> None:
    assert infer_wanted_artifact("build a react todo app with typescript") == "web_app"
    assert infer_wanted_artifact("Create a cool app for our demo") == "web_app"
    assert infer_wanted_artifact("Hey, can you build a cool up for our demo?") == "web_app"
    assert infer_wanted_artifact("build a video player website") == "web_app"


def test_codegen_refuses_video_and_admits_software() -> None:
    refused = admit_proposed_tool(
        "start_codegen_studio",
        {"goal": "create social media videos for the app"},
        user_speech="I need to create videos for social media.",
    )
    assert refused.action == "refuse"
    assert refused.reason == "cannot_produce_video"

    admitted = admit_proposed_tool(
        "start_codegen_studio",
        {"goal": "build a react todo app"},
        user_speech="build a react todo app with typescript",
    )
    assert admitted.action == "admit"


def test_plan_redirects_app_and_refuses_video() -> None:
    redirected = admit_proposed_tool(
        "plan_and_execute",
        {"goal": "build a react todo app"},
        user_speech="build a react todo app",
    )
    assert redirected.action == "redirect"
    assert redirected.name == "start_codegen_studio"

    refused = admit_proposed_tool(
        "plan_and_execute",
        {"goal": "create social media videos"},
        user_speech="I need to create videos for social media.",
    )
    assert refused.action == "refuse"


def test_prior_refusal_blocks_where_is_it() -> None:
    last = LastRefusal(tool="plan_and_execute", artifact="video", reason="cannot_produce_video")
    decision = admit_proposed_tool(
        "start_codegen_studio",
        {"goal": "where is the video"},
        user_speech="where is the video",
        last_refusal=last,
    )
    assert decision.action == "refuse"
    assert decision.reason in {"status_or_followup", "prior_refusal"}


def test_router_refuses_codegen_for_video() -> None:
    routed = get_capability_router().route(
        "start_codegen_studio",
        {"goal": "make a launch video"},
        RouteContext(user_speech="I need to create a video"),
    )
    assert routed.refused is True
    assert routed.reason == "cannot_produce_video"


def test_router_still_redirects_calendar_plan() -> None:
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "show my calendar events for today"},
        RouteContext(user_speech="show my calendar events for today"),
    )
    assert routed.refused is False
    assert routed.redirected is True
    assert routed.name == "google_workspace"


def test_start_codegen_studio_action_refuses_video() -> None:
    result = start_codegen_studio({"goal": "create a video for social media"})
    assert result["ok"] is False
    assert result["data"]["action"] == "refuse"


def test_start_codegen_studio_action_admits_app() -> None:
    result = start_codegen_studio({"goal": "build a react todo app with typescript"})
    assert result["ok"] is True
    assert result["data"]["action"] == "open_codegen_studio"


def test_text_turn_refuses_app_video() -> None:
    result = handle_assistant_turn(message="create an app video for the website")
    assert result.action == "capability_refuse"
    assert result.mode == "complete"


def test_text_turn_still_opens_react_app() -> None:
    result = handle_assistant_turn(message="build a react todo app with typescript")
    assert result.mode == "action"
    assert result.action == "codegen_studio"


def test_plan_where_is_meeting_is_not_a_video_refuse() -> None:
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "where is my meeting tomorrow"},
        RouteContext(user_speech="where is my meeting tomorrow"),
    )
    assert routed.refused is False
    assert routed.redirected is True
    assert routed.name == "google_workspace"


def test_prior_refusal_does_not_block_calendar() -> None:
    last = LastRefusal(tool="start_codegen_studio", artifact="video", reason="cannot_produce_video")
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "show my calendar events for today"},
        RouteContext(user_speech="show my calendar events for today", last_refusal=last),
    )
    assert routed.refused is False
    assert routed.name == "google_workspace"


def test_text_turn_create_videos_is_not_a_calendar_event() -> None:
    result = handle_assistant_turn(message="create videos for social media")
    assert result.action == "capability_refuse"
    assert result.mode == "complete"
