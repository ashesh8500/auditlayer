"""Tests for S0.6 prompt version footer reproducibility."""

from __future__ import annotations

from auditlayer_worker.core import (
    PROMPT_VERSION,
    AuditRecord,
    build_prompt_footer_line,
)
from auditlayer_worker.generation import MockReportGenerator, _mock_report_html
from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink


def test_prompt_version_is_non_empty():
    """PROMPT_VERSION is a non-empty string like '0.6'."""
    assert isinstance(PROMPT_VERSION, str)
    assert len(PROMPT_VERSION) > 0
    assert PROMPT_VERSION == "0.9"


def test_build_prompt_footer_line_includes_all_fields():
    """Footer line contains version, timestamp, cost, and token counts."""
    footer = build_prompt_footer_line(
        tokens_in=18000, tokens_out=22000, cost_usd=1.23,
    )
    assert f"Prompt v{PROMPT_VERSION}" in footer
    assert "UTC" in footer
    assert "$1.23" in footer
    assert "18000+22000 tokens" in footer
    assert footer.startswith('<p style="font-size:0.65rem')


def test_build_prompt_footer_line_uses_custom_version():
    """Custom version overrides the global PROMPT_VERSION."""
    footer = build_prompt_footer_line(version="9.9", tokens_in=1, tokens_out=2, cost_usd=0.01)
    assert "Prompt v9.9" in footer
    assert f"Prompt v{PROMPT_VERSION}" not in footer


def test_build_prompt_footer_line_uses_custom_timestamp():
    """Custom generated_at appears in the footer."""
    footer = build_prompt_footer_line(
        generated_at="2026-07-12 14:30 UTC",
        tokens_in=100, tokens_out=200, cost_usd=0.05,
    )
    assert "2026-07-12 14:30 UTC" in footer


def test_mock_report_html_has_placeholder():
    """Mock report HTML includes the PROMPT_VERSION_LINE placeholder."""
    audit = AuditRecord(
        id="test-ver-1", handle="test_user", platform="instagram", goal="growth",
    )
    html = _mock_report_html(audit)
    assert "<!-- PROMPT_VERSION_LINE -->" in html


def test_mock_pipeline_injects_prompt_version_footer(tmp_path):
    """The mock pipeline replaces PROMPT_VERSION_LINE placeholder with the real footer."""
    from dataclasses import replace

    settings = replace(
        WorkerSettings.from_env(),
        generator="mock", output_dir=tmp_path, pdf_mode="stub",
    )
    audit = AuditRecord(
        id="test-ver-2",
        handle="hemalpatelphd",
        platform="instagram",
        goal="growth",
        context="UCSD professor, PhD",
        milestone_label="Road to 20K",
    )
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(audit, sink, gateway=None)

    assert summary.status == "ready"
    assert summary.prompt_version == PROMPT_VERSION

    # Read the written HTML file
    html_path = tmp_path / "test-ver-2.html"
    assert html_path.exists()
    html = html_path.read_text()

    # Placeholder should be gone
    assert "<!-- PROMPT_VERSION_LINE -->" not in html
    # Real footer should be present
    assert f"Prompt v{PROMPT_VERSION}" in html
    assert "tokens" in html


def test_audit_record_parses_prompt_version():
    """AuditRecord.from_row parses prompt_version from a Supabase row dict."""
    row = {
        "id": "abc-123",
        "handle": "testuser",
        "platform": "instagram",
        "goal": "growth",
        "status": "ready",
        "prompt_version": "0.6",
    }
    audit = AuditRecord.from_row(row)
    assert audit.prompt_version == "0.6"


def test_audit_record_prompt_version_defaults_to_empty():
    """When prompt_version is missing from row, default to empty string."""
    row = {
        "id": "abc-456",
        "handle": "defaultuser",
        "platform": "instagram",
        "goal": "growth",
    }
    audit = AuditRecord.from_row(row)
    assert audit.prompt_version == ""
