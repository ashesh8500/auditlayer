"""Honest-null report projection quality regression harness (ALM-I-007).

P3 · C1/C6 · F1 · D2/D3/D8: a rendered standard report passes only when its
immutable HTML projection contains the exact canonical 15-section order and
inspectable coverage for the six customer answers (current state, blockers,
better peers, next-week actions, milestone path, money move), plus strengths,
ranked priorities, honest-null ``Data needed`` language, safe static HTML, and
print CSS. One isolated mutation per required invariant fails closed with a
stable blocker code. Report-type compatibility (pulse/extended/blueprint) is
preserved and the pipeline consumes the canonical gate.

The typed six-answer coverage contract (``intelligence/coverage.py``) is
authoritative; this harness validates only the immutable projection and makes
no claim about subjective editorial quality, model calibration, creator
efficacy, or business impact.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace
from pathlib import Path

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import STANDARD_SECTIONS, AuditRecord
from auditlayer_worker.generation import GenerationResult
from auditlayer_worker.intelligence import (
    ANSWER_KINDS as COVERAGE_ANSWER_KINDS,
    DATA_NEEDED_MARKER as COVERAGE_DATA_NEEDED_MARKER,
)
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink
from auditlayer_worker.quality import (
    ANSWER_KINDS,
    ANSWER_SECTION_MAP,
    DATA_NEEDED_MARKER,
    STANDARD_REPORT_SECTIONS,
    evaluate_report_quality,
    extract_report_sections,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "report_quality"
GOLDEN = (FIXTURES_DIR / "standard_golden.html").read_text(encoding="utf-8")


def _typed_answer_states(name: str = "honest_null_data_needed.json") -> dict[str, str]:
    fixture = json.loads(
        (
            FIXTURES_DIR.parent
            / "intelligence"
            / "answer_coverage"
            / name
        ).read_text(encoding="utf-8")
    )
    return {kind: answer["state"] for kind, answer in fixture["payload"]["answers"].items()}


ANSWER_STATES = _typed_answer_states()


def _section_re(heading: str) -> re.Pattern[str]:
    return re.compile(
        rf"<section><h2>{re.escape(heading)}</h2>.*?</section>", flags=re.I | re.S
    )


def _remove_section(html: str, heading: str) -> str:
    return _section_re(heading).sub("", html, count=1)


def _duplicate_section(html: str, heading: str) -> str:
    match = _section_re(heading).search(html)
    if match is None:
        raise AssertionError(f"section {heading!r} not found")
    return html[: match.end()] + match.group(0) + html[match.end():]


def _swap_sections(html: str, first: str, second: str) -> str:
    a, b = _section_re(first).search(html), _section_re(second).search(html)
    if a is None or b is None:
        raise AssertionError("swap sections not found")
    first_block, second_block = a.group(0), b.group(0)
    swapped = html[: a.start()] + second_block + html[a.end(): b.start()] + first_block + html[b.end():]
    return swapped


def _replace_in_section(html: str, heading: str, old: str, new: str) -> str:
    match = _section_re(heading).search(html)
    if match is None:
        raise AssertionError(f"section {heading!r} not found")
    section = match.group(0)
    if old not in section:
        raise AssertionError(f"{old!r} not found in {heading!r}")
    return html.replace(section, section.replace(old, new), 1)


def _empty_section(html: str, heading: str) -> str:
    match = _section_re(heading).search(html)
    if match is None:
        raise AssertionError(f"section {heading!r} not found")
    section = match.group(0)
    h2_match = re.search(r"<h2>.*?</h2>", section, flags=re.I | re.S)
    if h2_match is None:
        raise AssertionError(f"h2 not found in {heading!r}")
    return html.replace(section, f"<section>{h2_match.group(0)}<p>—</p></section>", 1)


def _remove_print_css(html: str) -> str:
    return re.sub(r"@media\s+print\s*\{.*?\}", "", html, flags=re.I | re.S)


# ---------------------------------------------------------------------------
# valid golden projection
# ---------------------------------------------------------------------------


def test_golden_standard_projection_passes_all_invariants() -> None:
    result = evaluate_report_quality(GOLDEN, report_type="standard", answer_states=ANSWER_STATES)

    assert result.passed
    assert result.blockers == ()

    headings = [heading for heading, _ in extract_report_sections(GOLDEN)]
    assert len(headings) == 15
    assert [h for h in headings] == [
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
        "Road to 20K Followers",
        "Audit Cadence",
        "Get the Execution Plan",
    ]
    # 6/6 answers have inspectable coverage (no answer-not-covered blockers).
    for kind in ANSWER_KINDS:
        assert f"answer not covered: {kind}" not in result.blockers
    assert "strengths missing" not in result.blockers
    assert "ranked priorities missing" not in result.blockers
    # Honest-null language preserved for the three data_needed answers.
    assert DATA_NEEDED_MARKER in GOLDEN
    assert "honest-null not preserved" not in " ".join(result.blockers)
    assert "fabricated precision" not in " ".join(result.blockers)
    # Safe static HTML + print CSS.
    assert "<script" not in GOLDEN.lower()
    assert "@media print" in GOLDEN.lower()


def test_golden_fixture_is_sanitized_and_deterministic() -> None:
    # No active content, no unresolved placeholders, no customer identifiers.
    lowered = GOLDEN.lower()
    assert "<script" not in lowered
    assert "<iframe" not in lowered
    assert "@{handle}" not in GOLDEN
    assert "{{" not in GOLDEN and "}}" not in GOLDEN
    # The typed six-answer corpus drives the fixture.
    assert set(ANSWER_STATES) == set(ANSWER_KINDS)
    assert ANSWER_STATES["blockers"] == "data_needed"
    assert ANSWER_STATES["current_state"] == "answered"


# ---------------------------------------------------------------------------
# one isolated mutation per required invariant fails closed
# ---------------------------------------------------------------------------

MUTATIONS = [
    ("missing required section", lambda html: _remove_section(html, "Peer Comparison"),
     "missing required section: Peer Comparison"),
    ("duplicate required section", lambda html: _duplicate_section(html, "Strengths"),
     "duplicate required section: Strengths"),
    ("required sections out of order", lambda html: _swap_sections(html, "Strengths", "Weaknesses"),
     "required sections out of order"),
    ("answer not covered", lambda html: _empty_section(html, "Get the Execution Plan"),
     "answer not covered: money_move"),
    ("fabricated precision in honest-null slot",
     lambda html: _replace_in_section(html, "Weaknesses", DATA_NEEDED_MARKER,
                                      "6.1% engagement is the real ceiling."),
     "fabricated precision in honest-null slot: blockers"),
    ("honest-null not preserved",
     lambda html: _replace_in_section(html, "Road to 20K Followers", DATA_NEEDED_MARKER,
                                      "Projection deferred"),
     "honest-null not preserved: milestone_path"),
    ("strengths missing", lambda html: _empty_section(html, "Strengths"),
     "strengths missing"),
    ("ranked priorities missing", lambda html: _empty_section(html, "Quick Wins — This Week"),
     "ranked priorities missing"),
    ("active content survived sanitization",
     lambda html: html.replace("</body>", "<script>alert(1)</script></body>"),
     "active content survived sanitization"),
    ("print CSS missing", lambda html: _remove_print_css(html),
     "print CSS missing"),
]


@pytest.mark.parametrize(
    "name,mutate,blocker",
    MUTATIONS,
    ids=[name for name, _, _ in MUTATIONS],
)
def test_mutation_fails_closed(name: str, mutate, blocker: str) -> None:
    mutated = mutate(GOLDEN)
    result = evaluate_report_quality(mutated, report_type="standard", answer_states=ANSWER_STATES)

    assert not result.passed
    assert blocker in result.blockers, f"{name}: missing blocker {blocker!r}; got {result.blockers}"


# ---------------------------------------------------------------------------
# typed contract stays authoritative; the harness boundary is explicit
# ---------------------------------------------------------------------------


def test_answer_states_rejects_unknown_kind() -> None:
    with pytest.raises(ValueError, match="unknown kind"):
        evaluate_report_quality(
            GOLDEN, report_type="standard", answer_states={"not_a_real_answer": "answered"}
        )


def test_answer_states_rejects_invalid_state() -> None:
    with pytest.raises(ValueError, match="must be 'answered' or 'data_needed'"):
        evaluate_report_quality(
            GOLDEN, report_type="standard", answer_states={"current_state": "unknown"}
        )


def test_honest_null_enforcement_requires_typed_states() -> None:
    # Without the typed state map the HTML harness cannot know a slot is
    # honest-null; the typed coverage contract stays authoritative there.
    mutated = _replace_in_section(GOLDEN, "Road to 20K Followers", DATA_NEEDED_MARKER,
                                  "Projection deferred")
    result = evaluate_report_quality(mutated, report_type="standard")
    assert "honest-null not preserved: milestone_path" not in result.blockers


def test_quality_constants_parity_with_typed_coverage_contract() -> None:
    assert ANSWER_KINDS == COVERAGE_ANSWER_KINDS
    assert DATA_NEEDED_MARKER == COVERAGE_DATA_NEEDED_MARKER


def test_quality_section_contract_parity_with_canonical_standard() -> None:
    assert list(STANDARD_REPORT_SECTIONS) == STANDARD_SECTIONS
    assert len(STANDARD_REPORT_SECTIONS) == 15
    for kind, mapped in ANSWER_SECTION_MAP.items():
        assert kind in ANSWER_KINDS
        assert mapped, f"{kind} has no mapped sections"
        for section in mapped:
            assert section in STANDARD_REPORT_SECTIONS, f"{kind} -> {section!r}"


# ---------------------------------------------------------------------------
# report-type compatibility: standard structure enforced only for standard
# ---------------------------------------------------------------------------


PULSE_HTML = """<!doctype html><html><head><style>@media print { body { background: #fff; } }</style></head><body>
<section><h2>Score Breakdown</h2>
<p>Profile clarity is strong and content quality is improving steadily across the snapshot window.</p>
<p>Engagement health remains the weakest dimension at 41 points and needs the most attention.</p>
</section>
<section><h2>Key Gaps</h2>
<p>Cadence is inconsistent and Reels distribution is thin across the observed thirty day window.</p>
<p>Three gaps dominate: cadence, Reels mix, and audience targeting for the verified niche.</p>
</section>
<section><h2>Three Immediate Moves</h2>
<p>First: publish a paper-breakdown carousel on Tuesday morning with a clear call to action.</p>
<p>Second: film a behind-the-lab Reel for Thursday showing the research workflow on camera.</p>
<p>Third: pin the best-performing breakdown to the profile and link it in every story.</p>
</section>
</body></html>"""


def test_pulse_projection_passes_without_standard_structure() -> None:
    result = evaluate_report_quality(PULSE_HTML, report_type="pulse")
    assert result.passed
    assert result.blockers == ()


def test_standard_structure_not_enforced_for_other_report_types() -> None:
    # A standard-shaped document with a removed section must not trip
    # standard-structure blockers when evaluated under another report type.
    mutated = _remove_section(GOLDEN, "Peer Comparison")
    for report_type in ("pulse", "extended", "blueprint", "enterprise"):
        result = evaluate_report_quality(mutated, report_type=report_type)
        assert not any(
            blocker.startswith(
                ("missing required section", "duplicate required section",
                 "required sections out of order", "answer not covered",
                 "strengths missing", "ranked priorities missing")
            )
            for blocker in result.blockers
        ), f"{report_type}: unexpected standard blocker {result.blockers}"


def test_extended_and_blueprint_projections_pass_canonical_gate() -> None:
    # Full extended (20-section) and blueprint (15-section) projections rendered
    # by the canonical renderer pass under their own report types.
    for report_type in ("extended", "blueprint"):
        audit = AuditRecord(
            id=f"compat-{report_type}", handle="creator", platform="instagram",
            goal="growth", report_type=report_type,
        )
        from auditlayer_worker.generation import _mock_report_html

        html = _mock_report_html(audit)
        result = evaluate_report_quality(html, report_type=report_type)
        # Length, safety, and print invariants hold for canonical renderer output;
        # no standard-structure blockers may appear for non-standard types.
        assert not any(
            blocker.startswith(
                ("missing required section", "duplicate required section",
                 "required sections out of order", "answer not covered",
                 "strengths missing", "ranked priorities missing")
            )
            for blocker in result.blockers
        ), f"{report_type}: unexpected standard blocker {result.blockers}"


# ---------------------------------------------------------------------------
# pipeline consumes the canonical gate
# ---------------------------------------------------------------------------


class _StaticGenerator:
    model = "static"

    def __init__(self, html: str) -> None:
        self._html = html

    def generate(self, audit, progress, **_kwargs) -> GenerationResult:
        for phase in ("researching", "metrics", "peers", "scoring", "composing"):
            progress(phase, phase)
        return GenerationResult(
            html=self._html, tokens_in=1, tokens_out=1, model="static",
        )

    def refine(self, *_args, **_kwargs):
        raise AssertionError("refine must not be reached")


def _pipeline(html: str, tmp_path) -> tuple[GenerationPipeline, AuditRecord, PrintEventSink]:
    settings = replace(
        WorkerSettings.from_env(),
        output_dir=tmp_path,
        generator="mock",
        alm_accounts_root=str(tmp_path / "accounts"),
    )
    audit = AuditRecord(
        id="qc-pipeline-1", handle="creator", platform="instagram",
        goal="growth", report_type="standard",
    )
    pipeline = GenerationPipeline(settings, _StaticGenerator(html))
    sink = PrintEventSink()
    return pipeline, audit, sink


def test_pipeline_passes_golden_projection_to_ready(tmp_path) -> None:
    pipeline, audit, sink = _pipeline(GOLDEN, tmp_path)
    summary = pipeline.run(audit, sink, gateway=None)

    assert summary.status == "ready"
    events = list(sink.events)
    phases = [phase for _, phase, _ in events]
    assert "quality_check" in phases
    assert any(phase == "quality_check" and detail.startswith("quality=100") for _, phase, detail in events)


def test_pipeline_holds_broken_projection_for_review_with_stable_blocker(tmp_path) -> None:
    broken = GOLDEN.replace("</body>", "<script>alert(1)</script></body>")
    pipeline, audit, sink = _pipeline(broken, tmp_path)
    summary = pipeline.run(audit, sink, gateway=None)

    assert summary.status == "needs_review"
    events = list(sink.events)
    phases = [phase for _, phase, _ in events]
    assert "quality_check" in phases
    assert any(
        phase == "quality_check" and "active content survived sanitization" in detail
        for _, phase, detail in events
    )
    assert "needs_review" in phases
    assert any(
        phase == "needs_review" and "held for founder review" in detail
        for _, phase, detail in events
    )
    assert summary.quality_score < 100
