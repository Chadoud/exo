"""Tests for promotional/spam signal quality gating."""

from __future__ import annotations

import pytest

from signal_quality import (
    SignalTier,
    evaluate_gmail_message,
    evaluate_memory_item,
    evaluate_text,
    looks_like_email_subject,
    looks_like_inbox_recap,
    transcript_promo_density,
)


@pytest.mark.parametrize(
    "subject",
    [
        "50% off everything — limited time only!",
        "Your weekly newsletter digest",
        "Unsubscribe anytime — special offer inside",
        "Black Friday sale starts now",
    ],
)
def test_promotional_subjects_rejected(subject: str) -> None:
    verdict = evaluate_text(subject, from_addr="marketing@store.com")
    assert verdict.tier == SignalTier.REJECT


@pytest.mark.parametrize(
    "text",
    [
        "Jouez GRATUITEMENT ce week-end ! — Découvrez le nouveau mode coopératif",
        "Profitez de -25 % sur toutes les éditions ! — C'est le moment idéal",
        "Disponible dès maintenant ! — PROTÉGEZ PANDORA. DEVENEZ NA'VI.",
    ],
)
def test_french_promotional_subjects_rejected(text: str) -> None:
    verdict = evaluate_memory_item("promo", text, provenance="chat")
    assert verdict.tier == SignalTier.REJECT


def test_personal_task_allowed() -> None:
    verdict = evaluate_text("Follow up with Alice about the contract by Friday")
    assert verdict.tier == SignalTier.ALLOW


def test_french_work_context_allowed() -> None:
    verdict = evaluate_memory_item(
        "projet_phoenix",
        "Deadline vendredi pour le client Phoenix",
        provenance="chat",
    )
    assert verdict.tier == SignalTier.ALLOW


def test_starred_promo_allowed() -> None:
    verdict = evaluate_text("50% off sale", user_starred=True)
    assert verdict.tier == SignalTier.ALLOW


def test_list_unsubscribe_header_rejected() -> None:
    verdict = evaluate_gmail_message(
        label_ids=["INBOX", "CATEGORY_UPDATES"],
        from_addr="hello@brand.example",
        subject="Meet the Super Sync Chrome Extension",
        snippet="A faster way to keep your site updated while you work.",
        headers={"List-Unsubscribe": "<https://example.com/unsub>"},
    )
    assert verdict.tier == SignalTier.REJECT
    assert verdict.reason == "list_header"


def test_french_unsubscribe_alone_quarantines() -> None:
    verdict = evaluate_text("Se desinscrire en bas de ce message.")
    assert verdict.tier == SignalTier.QUARANTINE


def test_french_list_footer_rejected() -> None:
    verdict = evaluate_text(
        "Qui voulez-vous voir a Paleo 2027? Se desinscrire. "
        "Vous recevez cet e-mail parce que vous etes abonne a notre newsletter."
    )
    assert verdict.tier == SignalTier.REJECT


def test_gmail_promotions_label_rejected() -> None:
    verdict = evaluate_gmail_message(
        label_ids=["INBOX", "CATEGORY_PROMOTIONS"],
        subject="Hello",
        snippet="Shop now",
    )
    assert verdict.tier == SignalTier.REJECT


def test_gmail_important_invoice_quarantined_or_allowed() -> None:
    verdict = evaluate_gmail_message(
        label_ids=["INBOX", "IMPORTANT"],
        subject="Invoice #1234 due April 1",
        snippet="Amount due CHF 120",
        from_addr="billing@company.com",
    )
    assert verdict.tier in (SignalTier.ALLOW, SignalTier.QUARANTINE)


def test_memory_mail_provenance_stricter() -> None:
    verdict = evaluate_memory_item(
        "Commitment: 50% off sale",
        "Limited time offer — shop now",
        provenance="mail",
    )
    assert verdict.tier == SignalTier.REJECT


def test_memory_chat_provenance_rejects_quarantine() -> None:
    verdict = evaluate_memory_item(
        "newsletter",
        "Your weekly newsletter digest — unsubscribe anytime",
        provenance="chat",
    )
    assert verdict.tier == SignalTier.REJECT


def test_memory_meeting_provenance_rejects_quarantine() -> None:
    verdict = evaluate_memory_item(
        "newsletter",
        "Unsubscribe from our weekly newsletter anytime",
        provenance="meeting",
    )
    assert verdict.tier == SignalTier.REJECT


def test_looks_like_email_subject_detects_commitment_title() -> None:
    assert looks_like_email_subject(
        "Commitment: Nouvelle Surface Go 3",
        "Nouvelle Surface Go 3 — Nouveau Windows 11",
    )


def test_looks_like_email_subject_allows_simple_fact() -> None:
    assert not looks_like_email_subject("dog", "Rex is a golden retriever")


def test_inbox_recap_shape_detected() -> None:
    transcript = "\n".join(
        [
            "Assistant: Surface Go 3 promo — shop now",
            "Assistant: Ubisoft sale this weekend",
            "Assistant: OneDrive storage warning",
            "Assistant: Division game update",
            "Assistant: Avatar game launch",
            "Assistant: Discount on editions",
            "Assistant: Free weekend play",
            "Assistant: Another promo subject line",
            "Assistant: Yet another marketing line",
        ]
    )
    assert looks_like_inbox_recap(transcript)


def test_transcript_promo_density_high_on_marketing_lines() -> None:
    transcript = "\n".join(
        [
            "Assistant: 50% off everything — limited time only!",
            "Assistant: Jouez GRATUITEMENT ce week-end !",
            "Assistant: Unsubscribe anytime — special offer inside",
            "User: thanks",
        ]
    )
    assert transcript_promo_density(transcript) >= 0.4


def test_visibility_thresholds_aligned() -> None:
    from signal_quality import (
        AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD,
        AUTO_MEMORY_TRIAGE_MAX_NOISE,
    )

    assert AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD == 0.35
    assert AUTO_MEMORY_TRIAGE_MAX_NOISE == AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD


def test_bypass_consent_keys_in_constants() -> None:
    from signal_quality import SIGNAL_CHECK_BYPASS_KEYS

    assert "startup_briefing_consent" in SIGNAL_CHECK_BYPASS_KEYS


def test_prompt_and_recall_visibility_aligned() -> None:
    from signal_quality import (
        AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD,
        is_prompt_visible,
        is_recall_visible,
    )

    entry = {
        "source": "auto",
        "reviewed": False,
        "noise_score": AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD,
        "archived_at": None,
    }
    assert is_prompt_visible(entry) is False
    assert is_recall_visible(entry) is False


def test_mail_task_allowed_rejects_quarantine() -> None:
    from signal_quality import mail_task_allowed

    text = "Your weekly newsletter digest"
    verdict = evaluate_text(text)
    assert verdict.tier == SignalTier.QUARANTINE
    assert mail_task_allowed(text) is False


@pytest.mark.parametrize(
    "subject",
    [
        "New sign-in to your OpenAI account",
        "Security alert: new login detected",
        "Verify your account — unusual activity",
        "Your password was changed",
    ],
)
def test_mail_task_allowed_rejects_security_notifications(subject: str) -> None:
    from signal_quality import is_mail_security_notification, mail_task_allowed

    assert is_mail_security_notification(subject) is True
    assert mail_task_allowed(subject) is False
    assert evaluate_text(subject).tier == SignalTier.ALLOW
