"""Offline regressions for the customer artifact boundary."""
from dataclasses import replace
import json
import re

from auditlayer_worker.core import REPORT_SECTIONS, assemble_structured_report_html
from auditlayer_worker.generation import _append_evidence_sources

from auditlayer_worker.core import AuditRecord, strip_internal_report_metadata
from auditlayer_worker.generation import MockReportGenerator, _mock_report_html
from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink


def test_refinement_removes_legacy_accounting_but_preserves_sources(tmp_path):
    audit = AuditRecord(id="customer-surface", handle="fictional", platform="instagram", goal="growth")
    original = _mock_report_html(audit).replace("</body>",
        '<p style="font-size:0.65rem">Prompt v1.8 &middot; 2026-09-19 10:00 UTC &middot; ~$0.13 &middot; 18000+22000 tokens</p>'
        '<aside class="alm-sources"><h3>Sources reviewed</h3><p>As of September 19, 2026</p>'
        '<a href="https://example.com/evidence">Evidence</a></aside></body>')
    settings = replace(WorkerSettings.from_env(), output_dir=tmp_path,
                       alm_accounts_root=str(tmp_path / "accounts"))
    html, tokens_in, tokens_out = GenerationPipeline(settings, MockReportGenerator()).refine(
        audit, original, "Strengths", "Clarify", PrintEventSink())
    assert "Prompt v" not in html
    assert "18000+22000 tokens" not in html
    assert "~$0.13" not in html
    assert "As of September 19, 2026" in html
    assert 'href="https://example.com/evidence"' in html
    assert tokens_in > 0 and tokens_out > 0


def test_report_link_uses_current_pricing_without_legacy_upsell():
    audit = AuditRecord(id="links", handle="fictional", platform="instagram", goal="growth")
    html = _mock_report_html(audit)
    assert 'href="https://auditlayermedia.com/pricing"' in html
    assert 'pricing?plan=pro' not in html
    assert '$50/month' not in html


def test_metadata_cleanup_does_not_erase_active_markup_before_validation():
    html = '<p onclick="alert(1)">Prompt v1.8 · ~$0.13 · 1+2 tokens</p>'
    assert strip_internal_report_metadata(html) == html


def wide_report():
    audit = AuditRecord(id="mobile-sample", handle="fictional_" + "x" * 80, platform="youtube", goal="growth")
    sections = [{"heading": "Road to 10K" if h == "Road to [Milestone]" else h,
                 "lede": "Offline layout fixture, not customer analysis.",
                 "items": [{"title": "A" * 90, "body": "B" * 120, "value": ""}]}
                for h in REPORT_SECTIONS["standard"]]
    for section in sections:
        if section["heading"] in {"Peer Comparison", "Success Benchmarks", "Content Calendar & Creative Board"}:
            count = 4 if section["heading"] == "Content Calendar & Creative Board" else 8
            section["table"] = {"headers": ["Column " + str(i) for i in range(count)],
                                "rows": [["Cell" * 25 for _ in range(count)]]}
    return assemble_structured_report_html(audit, json.dumps({"sections": sections}))


def test_wide_tables_and_calendar_have_independent_scroll_containers():
    html = wide_report()
    assert html.count('<div class="table-scroll"><table') == html.count('<table') > 0
    assert '<div class="table-scroll"><div class="calendar-grid">' in html
    assert re.search(r"\.table-scroll\s*\{[^}]*overflow-x:\s*auto", html)
    assert "overflow-wrap: anywhere" in html
    assert "minmax(0, 1fr)" in html
    assert "@media (max-width: 600px)" in html
    assert '<link ' not in html


def test_sources_are_inside_the_report_container():
    html = _append_evidence_sources(wide_report(), [("S" * 120, "https://example.com/" + "a" * 200, "public_research")], connected_metrics=False)
    assert html.index('class="container"') < html.index('class="alm-sources"') < html.index('class="report-footer"')
