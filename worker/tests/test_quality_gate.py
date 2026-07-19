from types import SimpleNamespace

from auditlayer_worker.quality import evaluate_report_quality


def _report(body: str, *, links: bool = True) -> str:
    citation = '<a href="https://example.com">Source</a>' if links else ""
    return f"<!doctype html><html><body><section><h2>Audit</h2>{body}{citation}</section></body></html>"


def test_quality_gate_passes_complete_grounded_report() -> None:
    body = " ".join(f"Evidence based recommendation number {index}." for index in range(120))

    result = evaluate_report_quality(_report(body), report_type="standard")

    assert result.passed
    assert not result.blockers


def test_quality_gate_blocks_unresolved_template_and_short_output() -> None:
    result = evaluate_report_quality(
        _report("@{handle} short", links=False),
        report_type="standard",
    )

    assert not result.passed
    assert "unresolved template placeholder" in result.blockers
    assert any(item.startswith("report too short") for item in result.blockers)


def test_quality_gate_requires_live_follower_metric_when_connected() -> None:
    body = " ".join(f"Unique analysis line {index} has enough useful words." for index in range(100))
    metrics = SimpleNamespace(profile=SimpleNamespace(followers_count=12345))

    result = evaluate_report_quality(
        _report(body),
        report_type="standard",
        ig_metrics=metrics,
    )

    assert not result.passed
    assert "live follower count missing from rendered report" in result.blockers


def test_quality_gate_blocks_severe_repetition() -> None:
    repeated = "Post three educational reels every week to improve qualified discovery. " * 5
    filler = " ".join(f"Distinct evidence item {index} supports the plan." for index in range(100))

    result = evaluate_report_quality(
        _report(repeated + filler),
        report_type="standard",
    )

    assert not result.passed
    assert any("repeated recommendation" in item for item in result.blockers)
