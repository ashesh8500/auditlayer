from types import SimpleNamespace

from auditlayer_worker.quality import evaluate_report_quality


def _section(heading: str, inner: str) -> str:
    return f"<section><h2>{heading}</h2>{inner}</section>"


def _report(body: str, *, links: bool = True) -> str:
    """Canonical 15-section standard projection with the caller's body injected
    into the Executive Summary section. Without the canonical structure the
    deterministic gate now (correctly) blocks a 'standard' report."""
    citation = '<a href="https://example.com">Source</a>' if links else ""
    return f"""<!doctype html><html><head><style>@media print {{ body {{ background: #fff; }} }}</style></head><body>
{_section("Executive Summary", f'<div class="score-diagram"><div class="sd-overall">64<span>/ 100</span></div></div>{citation}{body}')}
{_section("Key Metrics", '<div class="metric-grid"><div class="metric-card"><div class="value">12,400</div><div class="label">Followers</div></div></div>')}
{_section("Strengths", '<div class="sw-card strength"><div class="sw-label">Strength</div><p>Consistent posting cadence.</p></div>')}
{_section("Weaknesses", '<div class="sw-card weakness"><div class="sw-label">Weakness</div><p>Uneven Reels distribution.</p></div>')}
{_section("Root Cause Analysis", '<p>Inconsistent cadence and thin Reels distribution cap reach.</p>')}
{_section("Peer Comparison", '<div class="rec-card"><h4>Peer A</h4><p>Publishes more consistently.</p></div>')}
{_section("Content Format Analysis", '<div class="rec-card"><h4>Reels</h4><p>Strong reach driver.</p></div>')}
{_section("Engagement Growth Strategy", '<div class="rec-card"><div class="num">1</div><h4>Raise cadence</h4><p>Post four times weekly.</p></div>')}
{_section("Content Calendar & Creative Board", '<div class="idea-card"><div class="idea-meta">Educational</div><h4>Paper breakdown</h4></div>')}
{_section("Quick Wins — This Week", '<div class="timeline-item"><div class="t-dot accent"></div><div><h4>Paper carousel</h4><p>Publish Tuesday.</p></div></div>')}
{_section("Success Benchmarks", '<div class="data-table"><table><thead><tr><th>Metric</th></tr></thead><tbody><tr><td>Cadence</td></tr></tbody></table></div>')}
{_section("Audience Profile", '<div class="rec-card"><h4>Primary</h4><p>Biohacking enthusiasts.</p></div>')}
{_section("Road to 20K Followers", '<div class="timeline-item"><div class="t-dot accent"></div><div><h4>20K</h4><p>Fourteen weeks at current cadence.</p></div></div>')}
{_section("Audit Cadence", '<div class="rec-card"><h4>Re-audit</h4><p>Four weeks after changes.</p></div>')}
{_section("Get the Execution Plan", '<div class="upgrade-box"><h3>Plan</h3><p><strong>Cohort</strong> Launch the paid cohort.</p></div>')}
</body></html>"""


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
