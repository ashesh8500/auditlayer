from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re


class AuditStatus(str, Enum):
    DRAFT = "draft"
    QUEUED = "queued"
    RUNNING = "running"
    READY = "ready"
    NEEDS_REVIEW = "needs_review"
    BLOCKED = "blocked"
    FAILED = "failed"


class Plan(str, Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Goal(str, Enum):
    GROWTH = "growth"
    MONETIZATION = "monetization"
    REBRAND = "rebrand"
    LAUNCH = "launch_readiness"


class Platform(str, Enum):
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"
    YOUTUBE = "youtube"
    X = "x"
    LINKEDIN = "linkedin"
    UNKNOWN = "unknown"


PLAN_LIMITS = {
    Plan.FREE: 1,
    Plan.STARTER: 5,
    Plan.PRO: 15,
    Plan.ENTERPRISE: 10_000,
}

QUALIFIED_TERMS = (
    "phd",
    "md",
    "do",
    "np",
    "rn",
    "rd",
    "researcher",
    "clinician",
    "doctor",
    "dietitian",
    "scientist",
)

INSTAGRAM_LIMITATION = (
    "Instagram profile data is login-walled for unauthenticated collection as of May 2026. "
    "The audit will use available web indexation, client-supplied context, and domain benchmarks; "
    "missing live metrics are marked as data-quality limitations rather than guessed."
)


@dataclass(frozen=True)
class AuditIntake:
    email: str
    handle: str
    goal: Goal
    context: str = ""
    platform: Platform = Platform.UNKNOWN
    plan: Plan = Plan.FREE


@dataclass(frozen=True)
class IntakeDecision:
    accepted: bool
    status: AuditStatus
    reasons: tuple[str, ...]
    limitations: tuple[str, ...]
    platform: Platform
    milestone_label: str


def normalize_handle(handle: str) -> str:
    cleaned = handle.strip().lower()
    cleaned = cleaned.removeprefix("https://").removeprefix("http://")
    cleaned = cleaned.removeprefix("www.")
    if "/" in cleaned:
        parts = [part for part in cleaned.split("/") if part and part not in {"instagram.com", "tiktok.com", "youtube.com", "x.com"}]
        cleaned = parts[-1] if parts else cleaned
    cleaned = cleaned.removeprefix("@")
    cleaned = re.sub(r"[^a-z0-9_.-]", "", cleaned)
    return cleaned


def detect_platform(handle_or_url: str) -> Platform:
    value = handle_or_url.lower()
    if "tiktok.com" in value:
        return Platform.TIKTOK
    if "youtube.com" in value or "youtu.be" in value:
        return Platform.YOUTUBE
    if "x.com" in value or "twitter.com" in value:
        return Platform.X
    if "linkedin.com" in value:
        return Platform.LINKEDIN
    if "instagram.com" in value:
        return Platform.INSTAGRAM
    return Platform.INSTAGRAM if value.strip().startswith("@") else Platform.UNKNOWN


def infer_credential_signal(handle: str, context: str) -> bool:
    haystack = f"{handle} {context}".lower()
    return any(re.search(rf"\b{re.escape(term)}\b", haystack) for term in QUALIFIED_TERMS)


def next_milestone(followers: int | None) -> str:
    if followers is None:
        return "Road to next verified milestone"
    if followers < 300:
        return "Road to 2K"
    if followers < 2_000:
        return "Road to 10K"
    if followers < 10_000:
        return "Road to 20K"
    if followers < 50_000:
        return "Road to 100K"
    if followers < 100_000:
        return "Road to 250K"
    return "Road to 500K"


def evaluate_intake(intake: AuditIntake, completed_audits: int = 0, followers: int | None = None) -> IntakeDecision:
    reasons: list[str] = []
    limitations: list[str] = []
    handle = normalize_handle(intake.handle)
    platform = intake.platform if intake.platform != Platform.UNKNOWN else detect_platform(intake.handle)

    if not handle:
        reasons.append("A valid public handle or profile URL is required.")
    if completed_audits >= PLAN_LIMITS[intake.plan]:
        reasons.append(f"The {intake.plan.value} plan has reached its audit limit.")
    if not infer_credential_signal(handle, intake.context):
        limitations.append(
            "Credential fit is unverified. Evidence-based health audits should include PhD, MD, NP, RD, researcher, or comparable clinical/scientific context."
        )
    if platform == Platform.INSTAGRAM:
        limitations.append(INSTAGRAM_LIMITATION)
    if platform == Platform.UNKNOWN:
        limitations.append("Platform could not be confidently inferred; admin review may be required before generation.")

    hard_block = any(reason.startswith("A valid") or "audit limit" in reason for reason in reasons)
    review_needed = platform == Platform.UNKNOWN or not infer_credential_signal(handle, intake.context)
    status = AuditStatus.BLOCKED if hard_block else AuditStatus.NEEDS_REVIEW if review_needed else AuditStatus.QUEUED
    return IntakeDecision(
        accepted=not hard_block,
        status=status,
        reasons=tuple(reasons),
        limitations=tuple(limitations),
        platform=platform,
        milestone_label=next_milestone(followers),
    )

