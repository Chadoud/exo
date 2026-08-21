"""Skip drafts for ATS receipts; keep drafts when the last mail asks a question."""

from mail_initiative.reply_needed import skip_reason_for_draft

_SWISSQUOTE = (
    "Hi Chady,&nbsp;\n"
    "Thank you for applying to the Product Manager Associate - Trading "
    "position at Swissquote !&nbsp;\n"
    "What will happen next ? We'll review your application and get back to you "
    "in the upcoming weeks. In the meantime, feel free to check out our "
    "career's page.&nbsp;\n"
    "Thank you in advance !&nbsp;\n"
    "Best regards,&nbsp;\n"
    "Swissquote Recruitment Team recruitment@swissquote.ch&nbsp;\n"
    "Access My Application: https://jobs.smartrecruiters.com/my-applications/"
    "Swissquote/caa7faeb-f4fd-4cca-857e-2427a461d88c\n"
    "If you were not expecting this message you can report suspected "
    "suspicious activity to SmartRecruiters.\n"
    "Please do not share or forward this email, as it pertains to your "
    "specific job application"
)


def test_skips_ats_application_receipt():
    reason = skip_reason_for_draft(
        from_addr="recruitment@swissquote.ch",
        subject="Thank you for applying to Product Manager Associate - Trading",
        text=_SWISSQUOTE,
    )
    assert reason == "auto_ack"


def test_keeps_recruiter_who_asks_a_question():
    reason = skip_reason_for_draft(
        from_addr="recruitment@swissquote.ch",
        subject="Interview next week",
        text="Thank you for applying. Are you free Tuesday at 10?",
    )
    assert reason is None


def test_skips_auto_submitted_header():
    reason = skip_reason_for_draft(
        from_addr="ada@example.com",
        subject="Lunch tomorrow?",
        text="Can we meet tomorrow at noon to go over the plan?",
        headers={"Auto-Submitted": "auto-replied"},
    )
    assert reason == "auto_submitted"


def test_skips_do_not_reply_footer():
    reason = skip_reason_for_draft(
        from_addr="desk@clinic.example",
        subject="Appointment booked",
        text="Your visit is confirmed. This is an automated message. Do not reply to this email.",
    )
    assert reason == "auto_ack"


def test_keeps_do_you_ask_from_recruiter():
    reason = skip_reason_for_draft(
        from_addr="recruitment@swissquote.ch",
        subject="Quick chat",
        text="Thank you for applying. Do you have 20 minutes Thursday?",
    )
    assert reason is None


def test_keeps_personal_do_not_reply_wording():
    reason = skip_reason_for_draft(
        from_addr="ada@example.com",
        subject="Leaving at 5",
        text="If you do not reply to this I'll go without you.",
    )
    assert reason is None


def test_skips_auto_submitted_with_comment():
    reason = skip_reason_for_draft(
        from_addr="ada@example.com",
        subject="Lunch tomorrow?",
        text="Can we meet tomorrow at noon to go over the plan?",
        headers={"Auto-Submitted": "auto-replied; origin=mlmmj"},
    )
    assert reason == "auto_submitted"


def test_keeps_personal_thread():
    reason = skip_reason_for_draft(
        from_addr="ada@example.com",
        subject="Lunch tomorrow?",
        text="Can we meet tomorrow at noon to go over the plan?",
    )
    assert reason is None
