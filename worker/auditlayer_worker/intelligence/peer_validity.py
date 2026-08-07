"""Same-tier peer validity auditor for the cached peer boundary.

P4 · C3 · F1 · D2/D3/D8 (ALM-I-024): every cached ``peer_graph`` row that is
projected toward the bounded report prompt is classified exactly once as an
``admissible`` candidate or ``data_needed``/``rejected`` with a stable reason
code and an exact correction tip, before any deterministic projection.

The auditor is a pure, deterministic, fail-closed validator over the
``wellness_benchmarks → peer_graph`` cache shape returned by
``SupabaseGateway.get_cached_benchmarks`` (each benchmark dict carries a
``peers`` list). Admission requires:

- a normalized, syntactically plausible handle on a supported platform;
- niche equality with the parent benchmark and follower-bracket membership
  (same-tier policy; bounds are inclusive-min / exclusive-max, ``500k+`` is
  open-ended);
- non-empty provenance: ``source_url`` and an observation time
  ``source_observed_at`` within ``PEER_FRESHNESS_DAYS``, producing a
  deterministic source age in days;
- present metrics (followers/avg_likes/avg_comments) — missing data is
  ``data_needed``, never rendered as zero;
- relationship framing: ``unknown`` defaults to neutral framing; a
  collaborator/competitor claim requires matching evidence entries and is
  rejected when the evidence is contradictory or absent;
- stored verification is provenance only: ``failed`` rejects as unverifiable,
  while every other status still yields ``live_handle_validity=UNKNOWN``
  because this contract performs no network lookup.

Live handle existence, metric freshness in production, relationship truth,
report calibration, creator efficacy, and business impact are NOT proven by
this auditor or by its fixtures. Fixtures prove parser/admission/projection
contracts only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any, Mapping

# ---------------------------------------------------------------------------
# Canonical vocabularies (mirror supabase/migrations/0020_peer_graph.sql and
# the additive 20260807160000_peer_validity_evidence.sql contract).
# ---------------------------------------------------------------------------

SUPPORTED_PLATFORMS = frozenset(
    {"instagram", "tiktok", "youtube", "x", "linkedin"}
)
VERIFICATION_STATUSES = ("unverified", "verified", "failed")
RELATIONSHIP_STATUSES = ("unknown", "collaborator", "competitor")
RELATIONSHIP_EVIDENCE_KINDS = ("collaborator", "competitor")

#: Provenance freshness window. A peer whose source was observed more than
#: this many days before the audit is stale and cannot be projected as a
#: candidate lead. Deterministic and documented; tests cover the boundary.
PEER_FRESHNESS_DAYS = 180

MAX_HANDLE_LENGTH = 64
_HANDLE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_BRACKET_RE = re.compile(r"^(\d+)([km]?)\s*-\s*(\d+)([km]?)$")
_OPEN_BRACKET_RE = re.compile(r"^(\d+)([km]?)\+$")

# ---------------------------------------------------------------------------
# Classification vocabulary.
# ---------------------------------------------------------------------------

ADMISSIBLE = "admissible"
DATA_NEEDED = "data_needed"
REJECTED = "rejected"
CLASSIFICATIONS = (ADMISSIBLE, DATA_NEEDED, REJECTED)

# Stable reason / correction codes (machine-readable, exact, testable).
PEER_HANDLE_MISSING = "PEER_HANDLE_MISSING"
PEER_HANDLE_MALFORMED = "PEER_HANDLE_MALFORMED"
PEER_HANDLE_UNVERIFIABLE = "PEER_HANDLE_UNVERIFIABLE"
PEER_DUPLICATE_HANDLE = "PEER_DUPLICATE_HANDLE"
PEER_NICHE_MISMATCH = "PEER_NICHE_MISMATCH"
PEER_PLATFORM_UNSUPPORTED = "PEER_PLATFORM_UNSUPPORTED"
PEER_BRACKET_UNPARSEABLE = "PEER_BRACKET_UNPARSEABLE"
PEER_OFF_TIER = "PEER_OFF_TIER"
PEER_MISSING_FOLLOWERS = "PEER_MISSING_FOLLOWERS"
PEER_MISSING_METRICS = "PEER_MISSING_METRICS"
PEER_MISSING_PROVENANCE = "PEER_MISSING_PROVENANCE"
PEER_STALE_PROVENANCE = "PEER_STALE_PROVENANCE"
PEER_RELATIONSHIP_INVALID = "PEER_RELATIONSHIP_INVALID"
PEER_RELATIONSHIP_UNSUPPORTED = "PEER_RELATIONSHIP_UNSUPPORTED"
PEER_RELATIONSHIP_CONTRADICTORY = "PEER_RELATIONSHIP_CONTRADICTORY"

#: Every rejection/data-needed reason carries an exact correction tip.
CORRECTION_TIPS: dict[str, str] = {
    PEER_HANDLE_MISSING: "provide a non-empty handle",
    PEER_HANDLE_MALFORMED: "fix handle syntax (letters, digits, ., _, -; 1-64 chars; no @ or spaces)",
    PEER_HANDLE_UNVERIFIABLE: "stored verification_status=failed; re-verify the handle or remove the row",
    PEER_DUPLICATE_HANDLE: "remove the duplicate normalized handle (first occurrence wins)",
    PEER_NICHE_MISMATCH: "set peer.niche equal to its parent benchmark niche",
    PEER_PLATFORM_UNSUPPORTED: "use a supported platform (instagram, tiktok, youtube, x, linkedin)",
    PEER_BRACKET_UNPARSEABLE: "fix the parent followers_bracket (e.g. 10k-50k, 500k+)",
    PEER_OFF_TIER: "reassign the peer to the benchmark matching its follower bracket",
    PEER_MISSING_FOLLOWERS: "add followers count from the source observation",
    PEER_MISSING_METRICS: "add avg_likes/avg_comments from the source observation",
    PEER_MISSING_PROVENANCE: "add source_url and source_observed_at",
    PEER_STALE_PROVENANCE: f"refresh the source observation within {PEER_FRESHNESS_DAYS} days",
    PEER_RELATIONSHIP_INVALID: "relationship_status must be unknown, collaborator, or competitor",
    PEER_RELATIONSHIP_UNSUPPORTED: "add relationship_evidence entries matching the claimed relationship",
    PEER_RELATIONSHIP_CONTRADICTORY: "resolve conflicting collaborator/competitor evidence",
}

# Neutral framing label; the only framing emitted when the relationship is
# unknown. Never collaborator/competitor without evidence.
NEUTRAL_FRAMING = "neutral"

#: Honest offline boundary: this auditor performs no network lookup, so live
#: handle validity is always UNKNOWN.
LIVE_HANDLE_VALIDITY = "UNKNOWN"


class PeerValidityError(ValueError):
    """A peer row or benchmark cache violates the validity contract."""


# ---------------------------------------------------------------------------
# Typed verdicts
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PeerVerdict:
    """Exact classification of one cached peer row."""

    handle: str
    normalized_handle: str
    classification: str
    reason_code: str | None
    correction_tip: str | None
    niche: str
    bracket: str
    platform: str
    followers: int | None
    metrics: tuple[int, int, str] | None  # (avg_likes, avg_comments, top_format)
    source_age_days: int | None
    framing: str
    rationale: str | None

    @property
    def admissible(self) -> bool:
        return self.classification == ADMISSIBLE


@dataclass(frozen=True)
class PeerValidityReport:
    """Deterministic audit of a benchmark cache.

    ``benchmarks`` keeps input order; ``rows`` is the flat ordered list of
    one verdict per peer row across every benchmark. Every row appears exactly
    once (duplicates are rejected, never dropped).
    """

    benchmarks: list[dict[str, Any]]
    rows: list[PeerVerdict]
    now: datetime

    def summary(self) -> dict[str, int]:
        counts: dict[str, int] = {c: 0 for c in CLASSIFICATIONS}
        for row in self.rows:
            counts[row.classification] += 1
        return counts

    def reasons(self) -> dict[str, int]:
        reasons: dict[str, int] = {}
        for row in self.rows:
            if row.reason_code is not None:
                reasons[row.reason_code] = reasons.get(row.reason_code, 0) + 1
        return reasons


# ---------------------------------------------------------------------------
# Deterministic helpers
# ---------------------------------------------------------------------------


def normalize_handle(handle: Any) -> str:
    """Lowercase, strip whitespace, and drop a single leading ``@``.

    This is identity normalization for duplicate detection — it is NOT a
    claim that the public handle exists or is reachable.
    """
    if not isinstance(handle, str):
        return ""
    value = handle.strip().lower()
    if value.startswith("@"):
        value = value[1:]
    return value


def _valid_handle_syntax(normalized: str) -> bool:
    if not normalized or len(normalized) > MAX_HANDLE_LENGTH:
        return False
    return _HANDLE_RE.match(normalized) is not None


def parse_followers_bracket(bracket: Any) -> tuple[int, int | None] | None:
    """Parse a followers bracket like ``10k-50k`` or ``500k+``.

    Returns ``(min, max)`` with ``max=None`` for open-ended brackets, or
    ``None`` when the text cannot be parsed deterministically.
    """
    if not isinstance(bracket, str):
        return None
    text = bracket.strip().lower()
    match = _OPEN_BRACKET_RE.match(text)
    if match:
        low = int(match.group(1)) * _multiplier(match.group(2))
        return (low, None)
    match = _BRACKET_RE.match(text)
    if match:
        low = int(match.group(1)) * _multiplier(match.group(2))
        high = int(match.group(3)) * _multiplier(match.group(4))
        if high <= low:
            return None
        return (low, high)
    return None


def _multiplier(suffix: str) -> int:
    return 1_000_000 if suffix == "m" else 1_000 if suffix == "k" else 1


def _in_bracket(followers: int, bounds: tuple[int, int | None] | None) -> bool:
    """Same-tier membership: inclusive-min, exclusive-max, open top."""
    if bounds is None:
        return False
    low, high = bounds
    if followers < low:
        return False
    return high is None or followers < high


def _iso_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    elif isinstance(value, datetime):
        parsed = value
    else:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = int(value)
    if number != number or number < 0:
        return None
    return number


def _evidence_kinds(evidence: Any) -> list[str]:
    """Extract declared relationship kinds from a relationship_evidence array.

    Each entry must be a mapping with a ``kind`` in the canonical vocabulary;
    malformed entries are ignored (they are not evidence). Raw source/payload
    text is never copied into the verdict.
    """
    if not isinstance(evidence, list):
        return []
    kinds: list[str] = []
    for entry in evidence:
        if isinstance(entry, Mapping) and entry.get("kind") in RELATIONSHIP_EVIDENCE_KINDS:
            kinds.append(str(entry.get("kind")))
    return kinds


# ---------------------------------------------------------------------------
# The auditor
# ---------------------------------------------------------------------------


def audit_peer(
    peer: Mapping[str, Any],
    *,
    parent_benchmark: Mapping[str, Any],
    now: datetime,
    seen_handles: set[str],
) -> PeerVerdict:
    """Classify exactly one cached peer row against its parent benchmark."""

    handle_raw = peer.get("handle")
    normalized = normalize_handle(handle_raw)
    niche = parent_benchmark.get("niche") or ""
    bracket = parent_benchmark.get("followers_bracket") or ""
    platform = peer.get("platform") or ""

    def reject(code: str) -> PeerVerdict:
        return PeerVerdict(
            handle=str(handle_raw or ""),
            normalized_handle=normalized,
            classification=REJECTED,
            reason_code=code,
            correction_tip=CORRECTION_TIPS.get(code),
            niche=niche,
            bracket=bracket,
            platform=platform,
            followers=None,
            metrics=None,
            source_age_days=None,
            framing=NEUTRAL_FRAMING,
            rationale=None,
        )

    def data_needed(code: str) -> PeerVerdict:
        return PeerVerdict(
            handle=str(handle_raw or ""),
            normalized_handle=normalized,
            classification=DATA_NEEDED,
            reason_code=code,
            correction_tip=CORRECTION_TIPS.get(code),
            niche=niche,
            bracket=bracket,
            platform=platform,
            followers=None,
            metrics=None,
            source_age_days=None,
            framing=NEUTRAL_FRAMING,
            rationale=None,
        )

    # -- handle ------------------------------------------------------------
    if not normalized:
        return reject(PEER_HANDLE_MISSING)
    if not _valid_handle_syntax(normalized):
        return reject(PEER_HANDLE_MALFORMED)
    if normalized in seen_handles:
        return reject(PEER_DUPLICATE_HANDLE)
    seen_handles.add(normalized)

    # -- platform + niche ----------------------------------------------------
    if platform not in SUPPORTED_PLATFORMS:
        return reject(PEER_PLATFORM_UNSUPPORTED)
    peer_niche = str(peer.get("niche") or "").strip().lower()
    if not peer_niche or peer_niche != str(niche).strip().lower():
        return reject(PEER_NICHE_MISMATCH)

    # -- metrics ------------------------------------------------------------
    followers = _int_or_none(peer.get("followers"))
    if followers is None:
        return data_needed(PEER_MISSING_FOLLOWERS)
    avg_likes = _int_or_none(peer.get("avg_likes"))
    avg_comments = _int_or_none(peer.get("avg_comments"))
    if avg_likes is None or avg_comments is None:
        return data_needed(PEER_MISSING_METRICS)
    top_format = str(peer.get("top_format") or "").strip()

    # -- tier membership (same-tier policy) ----------------------------------
    bounds = parse_followers_bracket(bracket)
    if bounds is None:
        return data_needed(PEER_BRACKET_UNPARSEABLE)
    if not _in_bracket(followers, bounds):
        return reject(PEER_OFF_TIER)

    # -- provenance + source age ---------------------------------------------
    source_url = peer.get("source_url")
    observed_at = _iso_datetime(peer.get("source_observed_at"))
    if not isinstance(source_url, str) or not source_url.strip():
        return data_needed(PEER_MISSING_PROVENANCE)
    if observed_at is None:
        return data_needed(PEER_MISSING_PROVENANCE)
    source_age_days = max(0, (now - observed_at).days)
    if source_age_days > PEER_FRESHNESS_DAYS:
        return reject(PEER_STALE_PROVENANCE)

    # -- relationship framing --------------------------------------------------
    relationship_status = peer.get("relationship_status") or "unknown"
    if relationship_status not in RELATIONSHIP_STATUSES:
        return reject(PEER_RELATIONSHIP_INVALID)
    evidence_kinds = _evidence_kinds(peer.get("relationship_evidence"))
    if (
        "collaborator" in evidence_kinds and "competitor" in evidence_kinds
    ):
        return reject(PEER_RELATIONSHIP_CONTRADICTORY)
    if relationship_status in ("collaborator", "competitor"):
        if relationship_status not in evidence_kinds:
            return reject(PEER_RELATIONSHIP_UNSUPPORTED)
        framing = relationship_status
    else:
        framing = NEUTRAL_FRAMING

    # -- verification (provenance, never live proof) --------------------------
    verification = peer.get("verification_status") or "unverified"
    if verification not in VERIFICATION_STATUSES:
        verification = "unverified"
    if verification == "failed":
        return reject(PEER_HANDLE_UNVERIFIABLE)

    verification_note = (
        f"stored verification: {verification}; " if verification != "unverified" else ""
    )
    rationale = (
        f"same-tier peer @{normalized} in {niche} ({bracket}) on {platform}; "
        f"source observed {source_age_days}d ago; "
        f"relationship {relationship_status} → {framing} framing; "
        f"{verification_note}live handle validity {LIVE_HANDLE_VALIDITY}"
    )

    return PeerVerdict(
        handle=str(handle_raw),
        normalized_handle=normalized,
        classification=ADMISSIBLE,
        reason_code=None,
        correction_tip=None,
        niche=niche,
        bracket=bracket,
        platform=platform,
        followers=followers,
        metrics=(avg_likes, avg_comments, top_format),
        source_age_days=source_age_days,
        framing=framing,
        rationale=rationale,
    )


def audit_benchmark_cache(
    benchmarks: list[Mapping[str, Any]] | None,
    *,
    now: datetime | None = None,
) -> PeerValidityReport:
    """Audit the whole benchmark cache, one verdict per peer row.

    ``now`` is injectable for deterministic tests; when omitted it defaults to
    the current UTC time (the only non-deterministic input in production).
    """
    resolved_now = now if now is not None else datetime.now(timezone.utc)
    if not benchmarks:
        return PeerValidityReport(benchmarks=[], rows=[], now=resolved_now)

    seen_handles: set[str] = set()
    rows: list[PeerVerdict] = []
    normalized_benchmarks: list[dict[str, Any]] = []
    for benchmark in benchmarks:
        if not isinstance(benchmark, Mapping):
            raise PeerValidityError("benchmark cache entries must be mappings")
        peers = benchmark.get("peers") or []
        if not isinstance(peers, list):
            raise PeerValidityError("benchmark peers must be a list")
        for peer in peers:
            if not isinstance(peer, Mapping):
                raise PeerValidityError("peer rows must be mappings")
            rows.append(
                audit_peer(
                    peer,
                    parent_benchmark=benchmark,
                    now=resolved_now,
                    seen_handles=seen_handles,
                )
            )
        normalized_benchmarks.append(dict(benchmark))
    return PeerValidityReport(
        benchmarks=normalized_benchmarks,
        rows=rows,
        now=resolved_now,
    )
