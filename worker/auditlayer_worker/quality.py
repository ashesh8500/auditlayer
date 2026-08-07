"""Deterministic, zero-token report quality gate.

The gate is the canonical fail-closed validator over the immutable HTML report
projection used by ``pipeline.py``. For ``report_type=standard`` it additionally
enforces the canonical 15-section order and inspectable coverage for the six
customer answers, strengths, ranked priorities, honest-null language, safe
static HTML, and print CSS.

Typed evidence coverage (``intelligence/coverage.py``) remains authoritative
for *what is known*; this module validates only the *projection* — that the
product answers and editorial invariants actually survived into the rendered
HTML artifact. Passing fixtures prove the rendering/validation contract, never
subjective editorial quality, model calibration, creator efficacy, or business
impact.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import html
import re
from typing import Any, Mapping

# Canonical 15-section projection for standard reports. Must stay in parity
# with ``core.STANDARD_SECTIONS`` (asserted by the contract test suite).
STANDARD_REPORT_SECTIONS: tuple[str, ...] = (
    "Executive Summary",
    "Key Metrics",
    "Strengths",
    "Weaknesses",
    "Root Cause Analysis",
    "Peer Comparison",
    "Content Format Analysis",
    "Engagement Growth Strategy",
    "Content Calendar & Creative Board",
    "Quick Wins — This Week",
    "Success Benchmarks",
    "Audience Profile",
    "Road to [Milestone]",
    "Audit Cadence",
    "Get the Execution Plan",
)

# Deterministic mapping of the six customer answers to the standard report
# sections that must carry them in the immutable projection. Must stay in
# parity with ``intelligence.coverage.ANSWER_KINDS`` (asserted by tests).
ANSWER_SECTION_MAP: dict[str, tuple[str, ...]] = {
    "current_state": ("Executive Summary", "Key Metrics"),
    "blockers": ("Weaknesses", "Root Cause Analysis"),
    "better_peers": ("Peer Comparison",),
    "next_week_actions": ("Quick Wins — This Week",),
    "milestone_path": ("Road to [Milestone]",),
    "money_move": ("Get the Execution Plan",),
}

ANSWER_KINDS: tuple[str, ...] = tuple(ANSWER_SECTION_MAP)

# Canonical honest-null marker; matches intelligence.coverage.DATA_NEEDED_MARKER.
DATA_NEEDED_MARKER = "Data needed"

# Structural markers emitted by the canonical renderer (core.assemble_*). A
# section carrying one of these (or the honest-null marker, or a word budget)
# is "inspectable" — its answer content survived into the projection.
_CONTENT_MARKERS = (
    "metric-card",
    "sw-card",
    "rec-card",
    "data-table",
    "timeline-item",
    "idea-card",
    "score-diagram",
    "upgrade-box",
    "callout",
)

_MIN_COVERED_WORDS = 12

# Conservative heuristic for fabricated precision inside honest-null slots: a
# value-claim pattern (number + metric unit). The typed coverage contract is
# the authority for claim-level fabrication; this only guards the projection
# against a mutation that swaps "Data needed" for a made-up number. The match
# is intentionally boundary-loose (units may be word or symbol like %/$) and is
# scoped to the mapped sections of data_needed answers only.
_FABRICATED_PRECISION_RE = re.compile(
    r"\$?\d[\d,.]*\s*(followers|posts?|views|likes|comments|engagement|"
    r"reels?|videos?|subscribers|%|k|m|weeks?|months?|usd)",
    re.I,
)


@dataclass(frozen=True)
class QualityResult:
    passed: bool
    score: int
    blockers: tuple[str, ...]
    warnings: tuple[str, ...]

    @property
    def summary(self) -> str:
        details = [*self.blockers, *self.warnings]
        return f"quality={self.score}/100" + (f"; {'; '.join(details)}" if details else "")


def _visible_text(report_html: str) -> str:
    without_active = re.sub(
        r"<(script|style)\b[^>]*>.*?</\1>", " ", report_html, flags=re.I | re.S
    )
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", without_active))).strip()


def _words(text: str) -> int:
    return len(re.findall(r"\b[\w’'-]+\b", text))


def _canonical_matches(actual: str, required: str) -> bool:
    """Match one rendered heading against a canonical required heading."""
    if required == "Road to [Milestone]":
        return actual.startswith("Road to ")
    return actual == required


def extract_report_sections(report_html: str) -> list[tuple[str, str]]:
    """Return ``(heading, body_html)`` pairs for top-level ``<h2>`` sections.

    This is the single deterministic structure view used by the gate; it reads
    the immutable projection only and never attempts to recover canonical typed
    state from prose.
    """
    pattern = re.compile(r"<h2\b[^>]*>(.*?)</h2>", flags=re.I | re.S)
    matches = list(pattern.finditer(report_html))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        heading = _visible_text(match.group(1)).strip()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(report_html)
        body = report_html[match.end() : end]
        sections.append((heading, body))
    return sections


def _section_covered(body_html: str) -> bool:
    """A section is inspectable when it carries honest-null language, a known
    renderer marker, or a meaningful word budget."""
    if DATA_NEEDED_MARKER in _visible_text(body_html):
        return True
    lowered = body_html.lower()
    if any(marker in lowered for marker in _CONTENT_MARKERS):
        return True
    return _words(_visible_text(body_html)) >= _MIN_COVERED_WORDS


def _has_ranked_priorities(body_html: str) -> bool:
    """Quick-win / action sections must carry at least one concrete action item."""
    if re.search(r"timeline-item|rec-card|<ol\b|<li\b", body_html, flags=re.I):
        return True
    return _words(_visible_text(body_html)) >= _MIN_COVERED_WORDS


def evaluate_report_quality(
    report_html: str,
    *,
    report_type: str,
    ig_metrics: Any = None,
    answer_states: Mapping[str, str] | None = None,
) -> QualityResult:
    """Evaluate the immutable HTML projection with the canonical quality gate.

    ``answer_states`` is the optional typed six-answer state map (kind →
    ``answered`` | ``data_needed``) from the authoritative coverage contract.
    When supplied, honest-null preservation and fabricated-precision rejection
    are enforced per mapped section. When omitted, the typed contract remains
    authoritative and the HTML harness only enforces the structural invariants.
    """
    blockers: list[str] = []
    warnings: list[str] = []
    lowered = report_html.lower()
    visible = _visible_text(report_html)

    if "</html>" not in lowered or "<section" not in lowered:
        blockers.append("incomplete report document")
    if "@{handle}" in report_html or "{{" in report_html or "}}" in report_html:
        blockers.append("unresolved template placeholder")
    if re.search(r"<(script|iframe|object|embed)\b", report_html, flags=re.I):
        blockers.append("active content survived sanitization")

    minimum_words = {
        "pulse": 80,
        "standard": 250,
        "extended": 400,
        "enterprise": 400,
        "blueprint": 250,
    }.get(report_type, 200)
    word_count = _words(visible)
    if word_count < minimum_words:
        blockers.append(f"report too short ({word_count} words; minimum {minimum_words})")

    if ig_metrics is not None:
        profile = getattr(ig_metrics, "profile", None)
        followers = int(getattr(profile, "followers_count", 0) or 0)
        if followers and f"{followers:,}" not in visible and str(followers) not in visible:
            blockers.append("live follower count missing from rendered report")

    # Exact repeated sentences are a reliable low-false-positive signal for the
    # roadmap duplication Narin identified. Do not block stylistic short labels.
    sentences = [
        re.sub(r"\s+", " ", sentence).strip().lower()
        for sentence in re.split(r"(?<=[.!?])\s+", visible)
        if len(sentence.split()) >= 8
    ]
    repeated = [(sentence, count) for sentence, count in Counter(sentences).items() if count >= 3]
    if repeated:
        worst = max(count for _, count in repeated)
        message = f"repeated recommendation sentence ({worst} occurrences)"
        if worst >= 4:
            blockers.append(message)
        else:
            warnings.append(message)

    # --- immutable projection structure (standard reports only) -------------
    if report_type == "standard":
        sections = extract_report_sections(report_html)
        actual_headings = [heading for heading, _ in sections]

        for required in STANDARD_REPORT_SECTIONS:
            if not any(_canonical_matches(actual, required) for actual in actual_headings):
                blockers.append(f"missing required section: {required}")
        for required in STANDARD_REPORT_SECTIONS:
            count = sum(1 for actual in actual_headings if _canonical_matches(actual, required))
            if count > 1:
                blockers.append(f"duplicate required section: {required}")
        # Canonical order: the matched required-section indices must be
        # monotonically non-decreasing across document order. Comparing rendered
        # headings to the canonical placeholder names directly would false-fail
        # on "Road to <milestone>" headings, so compare resolved indices.
        required_index = {name: index for index, name in enumerate(STANDARD_REPORT_SECTIONS)}
        order: list[int] = []
        for actual in actual_headings:
            for required in STANDARD_REPORT_SECTIONS:
                if _canonical_matches(actual, required):
                    order.append(required_index[required])
                    break
        if any(before > after for before, after in zip(order, order[1:])):
            blockers.append("required sections out of order")
        for actual in actual_headings:
            if not any(_canonical_matches(actual, required) for required in STANDARD_REPORT_SECTIONS):
                warnings.append(f"unexpected section heading: {actual}")

        # Six customer answers must be inspectable in their mapped sections.
        for kind, mapped in ANSWER_SECTION_MAP.items():
            covered = any(
                _section_covered(body)
                for actual, body in sections
                if any(_canonical_matches(actual, required) for required in mapped)
            )
            if not covered:
                blockers.append(f"answer not covered: {kind}")

        strengths_body = next(
            (body for actual, body in sections if _canonical_matches(actual, "Strengths")), ""
        )
        if not _section_covered(strengths_body):
            blockers.append("strengths missing")

        quick_wins_body = next(
            (
                body
                for actual, body in sections
                if _canonical_matches(actual, "Quick Wins — This Week")
            ),
            "",
        )
        if not _has_ranked_priorities(quick_wins_body):
            blockers.append("ranked priorities missing")

        if answer_states is not None:
            unknown = set(answer_states) - set(ANSWER_KINDS)
            if unknown:
                raise ValueError(f"answer_states has unknown kind: {sorted(unknown)[0]}")
            for kind, state in answer_states.items():
                if state not in {"answered", "data_needed"}:
                    raise ValueError(f"answer_states[{kind}] must be 'answered' or 'data_needed'")
                if state != "data_needed":
                    continue
                mapped_bodies = [
                    body
                    for actual, body in sections
                    if any(_canonical_matches(actual, required) for required in ANSWER_SECTION_MAP[kind])
                ]
                if not any(DATA_NEEDED_MARKER in _visible_text(body) for body in mapped_bodies):
                    blockers.append(f"honest-null not preserved: {kind}")
                if any(_FABRICATED_PRECISION_RE.search(_visible_text(body)) for body in mapped_bodies):
                    blockers.append(f"fabricated precision in honest-null slot: {kind}")

    # --- print support (all report types share the canonical skeleton) ------
    if not re.search(r"@media\s+print|@page\b", report_html, flags=re.I):
        blockers.append("print CSS missing")

    if not re.search(r"https?://", report_html, flags=re.I) and "data-source-kind=" not in report_html:
        warnings.append("no external source citation")

    score = max(0, 100 - 25 * len(blockers) - 5 * len(warnings))
    return QualityResult(
        passed=not blockers,
        score=score,
        blockers=tuple(blockers),
        warnings=tuple(warnings),
    )
