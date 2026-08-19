from orchestrator.failure_admit import is_trash_inbox_failure, outcome_from_failure_content


def test_cut_off_yeah_thats_is_trash():
    goal = ". Yeah, that's"
    outcome = (
        "I can't determine what you're asking—your message (\". Yeah, that's\") "
        "is cut off and doesn't state a complete request."
    )
    assert is_trash_inbox_failure(goal, outcome) is True


def test_clear_failed_ask_is_kept():
    assert (
        is_trash_inbox_failure(
            "find my latest invoices and summarize them",
            "Couldn't pull the amount for one invoice.",
        )
        is False
    )


def test_short_real_goal_is_kept():
    assert is_trash_inbox_failure("deploy", "timed out") is False


def test_empty_goal_is_trash():
    assert is_trash_inbox_failure("", "tool failed") is True


def test_outcome_extract():
    text = "Goal: deploy demo\nOutcome: boom"
    assert outcome_from_failure_content(text) == "boom"
