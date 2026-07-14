"""Cross-layer intake parity tests.

Verifies that ``worker/auditlayer_worker/core.py`` and ``web/src/lib/domain.ts``
produce identical decisions for the same inputs.  The web TypeScript version is
the canonical reference for v2 intake; these tests keep the Python worker in
lock-step.

Intentional differences from legacy v1 (``legacy/src/auditlayer/domain.py``):
- No credential gate (``infer_credential_signal`` removed — AGENTS.md).
- Bare handles with dots default to Instagram (``dr.truptikaji`` → Instagram).
- ``giftedAudits`` bypass is available in both web and worker; defaults to 0 in worker (plan limits enforced).
- ``effectivePlanForProfile`` / admin-as-enterprise is web-only.
"""

from __future__ import annotations

import pytest

from auditlayer_worker.core import (
    AuditStatus,
    IntakeDecision,
    Plan,
    Platform,
    detect_platform,
    evaluate_intake,
    next_milestone,
    normalize_handle,
)

# ---------------------------------------------------------------------------
# normalize_handle — parity with web normalizeHandle
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw_input, expected",
    [
        # Full Instagram URL
        ("https://instagram.com/@HemalPatelPhD/", "hemalpatelphd"),
        ("https://www.instagram.com/dr.truptikaji/", "dr.truptikaji"),
        # @handle
        ("@Example_User", "example_user"),
        ("@iamsrk", "iamsrk"),
        # TikTok URL
        ("https://tiktok.com/@creator", "creator"),
        # YouTube URL
        ("https://youtube.com/@channel", "channel"),
        ("https://youtu.be/watch?v=abc", "watchvabc"),  # query stripped by regex; ?= → vabc
        # X URL
        ("https://x.com/user", "user"),
        ("https://twitter.com/user", "user"),
        # LinkedIn URL
        ("https://linkedin.com/in/username", "username"),
        # Bare handle
        ("randomhandle", "randomhandle"),
        ("dr.truptikaji", "dr.truptikaji"),
        ("user.name123", "user.name123"),
    ],
)
def test_normalize_handle_parity(raw_input: str, expected: str) -> None:
    assert normalize_handle(raw_input) == expected


# ---------------------------------------------------------------------------
# detect_platform — parity with web detectPlatform
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw_input, expected",
    [
        # URLs with platform signals
        ("https://tiktok.com/@creator", Platform.TIKTOK),
        ("https://youtube.com/@channel", Platform.YOUTUBE),
        ("https://youtu.be/short", Platform.YOUTUBE),
        ("https://x.com/user", Platform.X),
        ("https://twitter.com/user", Platform.X),
        ("https://linkedin.com/in/user", Platform.LINKEDIN),
        ("https://instagram.com/user", Platform.INSTAGRAM),
        # @handle → Instagram
        ("@iamsrk", Platform.INSTAGRAM),
        ("@dr.truptikaji", Platform.INSTAGRAM),
        # Bare handle (no dot) → Instagram
        ("randomhandle", Platform.INSTAGRAM),
        ("iamsrk", Platform.INSTAGRAM),
        # Bare handle with dot, long last-segment → Instagram
        ("dr.truptikaji", Platform.INSTAGRAM),
        ("user.name123", Platform.INSTAGRAM),
        ("some.creator_name", Platform.INSTAGRAM),
        # Bare handle with dot, short last-segment (looks like domain) → unknown
        ("brand.co", Platform.UNKNOWN),
        ("site.com", Platform.UNKNOWN),
        ("example.org", Platform.UNKNOWN),
        ("store.shop", Platform.UNKNOWN),
    ],
)
def test_detect_platform_parity(raw_input: str, expected: Platform) -> None:
    assert detect_platform(raw_input) == expected


# ---------------------------------------------------------------------------
# next_milestone — parity with web nextMilestone
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "followers, expected",
    [
        (None, "Road to next verified milestone"),
        (150, "Road to 2K"),
        (299, "Road to 2K"),
        (500, "Road to 10K"),
        (1_999, "Road to 10K"),
        (5_000, "Road to 20K"),
        (9_999, "Road to 20K"),
        (15_000, "Road to 100K"),
        (49_999, "Road to 100K"),
        (75_000, "Road to 250K"),
        (99_999, "Road to 250K"),
        (150_000, "Road to 500K"),
    ],
)
def test_next_milestone_parity(followers: int | None, expected: str) -> None:
    assert next_milestone(followers) == expected


# ---------------------------------------------------------------------------
# evaluate_intake — parity with web evaluateIntake
# ---------------------------------------------------------------------------


def _dec(
    handle: str,
    goal: str = "growth",
    context: str = "",
    plan: Plan = Plan.FREE,
    platform: Platform = Platform.UNKNOWN,
    completed_audits: int = 0,
    followers: int | None = None,
) -> IntakeDecision:
    return evaluate_intake(
        handle=handle,
        goal=goal,
        context=context,
        plan=plan,
        platform=platform,
        completed_audits=completed_audits,
        followers=followers,
    )


# -- accepted / queued cases ------------------------------------------------


def test_instagram_handle_queued() -> None:
    """@handle + Instagram → queued with Instagram limitation."""
    d = _dec("@hemalpatelphd", context="UCSD professor, PhD")
    assert d.accepted is True
    assert d.status == AuditStatus.QUEUED
    assert d.platform == Platform.INSTAGRAM
    assert d.normalized_handle == "hemalpatelphd"
    assert any("Instagram limits" in lim for lim in d.limitations)


def test_bare_handle_no_context_queued() -> None:
    """Bare username defaults to Instagram → queued with no-context limitation."""
    d = _dec("randomhandle", context="")
    assert d.accepted is True
    assert d.status == AuditStatus.QUEUED
    assert d.platform == Platform.INSTAGRAM
    assert d.normalized_handle == "randomhandle"
    assert any("No optional context" in lim for lim in d.limitations)


def test_brand_without_clinical_context_queued() -> None:
    """Non-clinical brand with known platform → queued (no credential gate in v2)."""
    d = _dec("@snackbrand", context="CPG food company, LA-based")
    assert d.status == AuditStatus.QUEUED
    assert d.platform == Platform.INSTAGRAM


def test_dotted_handle_instagram() -> None:
    """Dotted handle like dr.truptikaji → Instagram (dot segment > 4 chars)."""
    d = _dec("dr.truptikaji", context="Integrative medicine doctor")
    assert d.platform == Platform.INSTAGRAM
    assert d.status == AuditStatus.QUEUED


def test_plan_limit_not_reached() -> None:
    """Under plan limit → queued."""
    d = _dec("@user", plan=Plan.STARTER, completed_audits=3)
    assert d.status == AuditStatus.QUEUED


def test_platform_explicitly_provided() -> None:
    """Explicit platform parameter is trusted over detection."""
    d = _dec("brand.co", platform=Platform.INSTAGRAM)
    assert d.platform == Platform.INSTAGRAM
    assert d.status == AuditStatus.QUEUED


# -- needs_review cases -----------------------------------------------------


def test_ambiguous_dotted_slug_needs_review() -> None:
    """brand.co → short TLD-like → unknown → needs_review."""
    d = _dec("brand.co", context="")
    assert d.status == AuditStatus.NEEDS_REVIEW
    assert d.platform == Platform.UNKNOWN
    assert any("founder review" in lim.lower() for lim in d.limitations)


def test_domain_looking_slug_needs_review() -> None:
    """site.com → short TLD-like → unknown → needs_review."""
    d = _dec("site.com")
    assert d.status == AuditStatus.NEEDS_REVIEW
    assert d.platform == Platform.UNKNOWN


def test_store_shop_needs_review() -> None:
    """store.shop → 4-char TLD → unknown → needs_review."""
    d = _dec("store.shop")
    assert d.status == AuditStatus.NEEDS_REVIEW


# -- blocked cases ----------------------------------------------------------


def test_empty_handle_blocked() -> None:
    """Empty handle → blocked."""
    d = _dec("   ")
    assert d.accepted is False
    assert d.status == AuditStatus.BLOCKED
    assert any("valid public handle" in r for r in d.reasons)


def test_plan_limit_reached_blocked() -> None:
    """Plan limit exhausted → blocked."""
    d = _dec("@user", plan=Plan.FREE, completed_audits=1)
    assert d.status == AuditStatus.BLOCKED
    assert d.accepted is False


def test_plan_limit_exactly_at_boundary() -> None:
    """At exact limit → blocked."""
    d = _dec("@user", plan=Plan.STARTER, completed_audits=5)
    assert d.status == AuditStatus.BLOCKED


def test_plan_limit_just_under() -> None:
    """Just under limit → queued."""
    d = _dec("@user", plan=Plan.STARTER, completed_audits=4)
    assert d.status == AuditStatus.QUEUED


# -- gifted_audits bypass — parity with web ----------------------------------


def test_gifted_audits_bypass_plan_limit() -> None:
    """gifted_audits > 0: plan limit ignored → queued."""
    d = evaluate_intake(
        "@user", "growth", plan=Plan.FREE, completed_audits=1, gifted_audits=1,
    )
    assert d.status == AuditStatus.QUEUED
    assert d.accepted is True


def test_gifted_audits_zero_enforces_limit() -> None:
    """gifted_audits == 0: plan limit enforced → blocked."""
    d = evaluate_intake(
        "@user", "growth", plan=Plan.FREE, completed_audits=1, gifted_audits=0,
    )
    assert d.status == AuditStatus.BLOCKED


def test_gifted_audits_default_is_zero() -> None:
    """Default gifted_audits is 0 → plan limit enforced."""
    d = _dec("@user", plan=Plan.FREE, completed_audits=1)
    assert d.status == AuditStatus.BLOCKED


# -- milestone + followers --------------------------------------------------


def test_followers_passed_through_to_milestone() -> None:
    d = _dec("@user", followers=5_000)
    assert d.milestone_label == "Road to 20K"


def test_no_followers_defaults_milestone() -> None:
    d = _dec("@user", followers=None)
    assert d.milestone_label == "Road to next verified milestone"


# -- IntakeDecision.normalized_handle parity with web IntakeDecision ---------


def test_normalized_handle_on_decision() -> None:
    """Worker IntakeDecision now includes normalized_handle (structural parity)."""
    d = _dec("https://instagram.com/@Dr_TruptiKaji/")
    assert d.normalized_handle == "dr_truptikaji"
    assert d.normalized_handle == normalize_handle("https://instagram.com/@Dr_TruptiKaji/")


# -- context limitation -----------------------------------------------------


def test_context_provided_suppresses_limitation() -> None:
    """When context is provided, no 'No optional context' limitation."""
    d = _dec("@user", context="Wellness coach, NYC-based")
    assert not any("No optional context" in lim for lim in d.limitations)


def test_context_empty_adds_limitation() -> None:
    """When context is empty, add the no-context limitation."""
    d = _dec("@user", context="")
    assert any("No optional context" in lim for lim in d.limitations)


def test_context_whitespace_only_adds_limitation() -> None:
    """When context is whitespace only, add the no-context limitation."""
    d = _dec("@user", context="   ")
    assert any("No optional context" in lim for lim in d.limitations)


# -- TikTok / YouTube / X / LinkedIn — happy paths --------------------------


def test_tiktok_url_detected_and_queued() -> None:
    d = _dec("https://tiktok.com/@creator", context="Dance content")
    assert d.platform == Platform.TIKTOK
    assert d.status == AuditStatus.QUEUED
    # TikTok does NOT get Instagram limitation
    assert not any("Instagram limits" in lim for lim in d.limitations)


def test_youtube_url_detected_and_queued() -> None:
    d = _dec("https://youtube.com/@channel", context="Tech reviews")
    assert d.platform == Platform.YOUTUBE
    assert d.status == AuditStatus.QUEUED


def test_x_url_detected_and_queued() -> None:
    d = _dec("https://x.com/user", context="Tech commentary")
    assert d.platform == Platform.X
    assert d.status == AuditStatus.QUEUED


def test_linkedin_url_detected_and_queued() -> None:
    d = _dec("https://linkedin.com/in/username", context="B2B marketing")
    assert d.platform == Platform.LINKEDIN
    assert d.status == AuditStatus.QUEUED
