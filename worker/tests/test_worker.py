"""Offline tests: no Supabase, no model tokens."""

from __future__ import annotations

from dataclasses import replace

from auditlayer_worker.billing import estimate_cost
from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import (
    GENERATION_PHASES,
    AuditRecord,
    AuditStatus,
    Plan,
    Platform,
    evaluate_intake,
    extract_fragment,
    extract_html,
    next_milestone,
    normalize_handle,
    replace_section,
)
from auditlayer_worker.generation import MockReportGenerator
from auditlayer_worker.pdf import render_pdf
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink


def _settings(**over) -> WorkerSettings:
    base = WorkerSettings.from_env()
    return replace(base, **over)


def test_normalize_handle_strips_urls_and_at():
    assert normalize_handle("https://instagram.com/@HemalPatelPhD/") == "hemalpatelphd"
    assert normalize_handle("@Example_User") == "example_user"


def test_intake_gating_and_milestone():
    # @handle defaults to Instagram -> queued (no credential gate).
    decision = evaluate_intake(handle="@hemalpatelphd", goal="growth", context="UCSD professor, PhD")
    assert decision.platform == Platform.INSTAGRAM
    assert decision.status == AuditStatus.QUEUED
    assert any("Instagram limits what unauthenticated" in lim for lim in decision.limitations)
    # General brand without clinical context still queues when platform is known.
    brand = evaluate_intake(
        handle="@snackbrand", goal="growth", context="CPG food company, LA-based"
    )
    assert brand.platform == Platform.INSTAGRAM
    assert brand.status == AuditStatus.QUEUED
    # Bare username without @ still defaults to Instagram -> queued.
    bare = evaluate_intake(handle="randomhandle", goal="growth", context="")
    assert bare.platform == Platform.INSTAGRAM
    assert bare.status == AuditStatus.QUEUED
    # Ambiguous dotted slug -> unknown platform -> needs_review.
    weak = evaluate_intake(handle="brand.co", goal="growth", context="")
    assert weak.status == AuditStatus.NEEDS_REVIEW


def test_next_milestone_tiers():
    assert next_milestone(150) == "Road to 2K"
    assert next_milestone(5000) == "Road to 20K"
    assert next_milestone(None).startswith("Road to")


def test_extract_html_from_fence_and_doctype():
    assert "<html" in extract_html("```html\n<!doctype html><html></html>\n```").lower()
    assert extract_html("<!doctype html><html><body>x</body></html>").lower().startswith("<!doctype")


def test_extract_fragment_rejects_scripts():
    assert "<section" in extract_fragment("<section><h2>X</h2><p>ok</p></section>")
    try:
        extract_fragment("<section><script>alert(1)</script></section>")
        assert False, "expected guardrail to reject script"
    except ValueError:
        pass


def test_replace_section_swaps_one_section():
    html = "<main><section><h2>Strengths</h2><p>old</p></section></main>"
    out = replace_section(html, "Strengths", "<section><h2>Strengths</h2><p>new</p></section>")
    assert "new" in out and "old" not in out


def test_estimate_cost_within_band():
    cost = estimate_cost(20000, 30000, 0.27, 1.10)
    # Token cost + small data-API allowance should land in the documented band.
    assert 0.0 < cost.total_usd < 3.0
    assert cost.tokens_in == 20000


def test_pdf_stub_is_valid_pdf():
    result = render_pdf("<html><body>hi</body></html>", mode="stub")
    assert result.mode == "stub"
    assert result.data.startswith(b"%PDF")
    assert result.data.rstrip().endswith(b"%%EOF")


def test_mock_pipeline_emits_all_phases_and_writes_files(tmp_path):
    settings = _settings(generator="mock", output_dir=tmp_path, pdf_mode="stub")
    audit = AuditRecord(
        id="demo-test-1",
        handle="hemalpatelphd",
        platform="instagram",
        goal="growth",
        context="UCSD professor, PhD",
        milestone_label="Road to 20K",
    )
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(audit, sink, gateway=None)

    phases = [p for _, p, _ in sink.events]
    for required in ("started", *GENERATION_PHASES, "uploaded", "succeeded"):
        assert required in phases, f"missing phase {required}"
    assert summary.status == "ready"
    assert (tmp_path / "demo-test-1.html").exists()
    assert (tmp_path / "demo-test-1.pdf").exists()
    assert summary.cost_usd > 0


def test_pipeline_gate_blocks_when_calibration_blocks():
    settings = _settings(generator="mock")
    audit = AuditRecord(id="d2", handle="", platform="unknown", goal="growth", context="")
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    summary = pipeline.run(audit, PrintEventSink(), gateway=None, enforce_gate=True)
    assert summary.status in (AuditStatus.BLOCKED.value, AuditStatus.NEEDS_REVIEW.value)
