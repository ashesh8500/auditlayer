from auditlayer.domain import AuditIntake, AuditStatus, Goal, Plan, Platform, evaluate_intake, next_milestone, normalize_handle


def test_normalize_handle_accepts_urls_and_handles():
    assert normalize_handle("@JaneSmithPhD") == "janesmithphd"
    assert normalize_handle("https://instagram.com/Jane.Smith/") == "jane.smith"


def test_credential_uncertainty_goes_to_founder_review():
    decision = evaluate_intake(AuditIntake(email="a@b.com", handle="@wellnesscoach", goal=Goal.GROWTH))
    assert decision.accepted is True
    assert decision.status == AuditStatus.NEEDS_REVIEW
    assert any("Credential fit is unverified" in item for item in decision.limitations)


def test_qualified_instagram_goes_to_queue_with_data_limitation():
    decision = evaluate_intake(
        AuditIntake(
            email="a@b.com",
            handle="@janesmithphd",
            goal=Goal.MONETIZATION,
            context="PhD researcher in longevity",
            platform=Platform.INSTAGRAM,
            plan=Plan.STARTER,
        )
    )
    assert decision.status == AuditStatus.QUEUED
    assert any("Instagram profile data is login-walled" in item for item in decision.limitations)


def test_plan_limit_blocks_extra_free_audit():
    decision = evaluate_intake(
        AuditIntake(email="a@b.com", handle="@janesmithphd", goal=Goal.GROWTH, context="PhD"),
        completed_audits=1,
    )
    assert decision.accepted is False
    assert decision.status == AuditStatus.BLOCKED


def test_milestones_are_tiered():
    assert next_milestone(120) == "Road to 2K"
    assert next_milestone(500) == "Road to 10K"
    assert next_milestone(12_000) == "Road to 100K"
    assert next_milestone(120_000) == "Road to 500K"

