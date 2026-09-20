"""Deterministic report-brand checks; no model or service calls."""
import re
from pathlib import Path

import pytest
from auditlayer_worker.core import AuditRecord, assemble_report_html, _load_template_sections


@pytest.mark.parametrize("kind", ["pulse", "standard", "extended", "enterprise", "blueprint"])
def test_future_reports_embed_portable_canonical_wordmark(kind):
    audit = AuditRecord(id="brand-fixture", handle="fictional_brand", platform="instagram", goal="growth", report_type=kind)
    sections = "".join(f"<section><h2>{'Road to 10K' if h == 'Road to [Milestone]' else h}</h2><p>Offline branding fixture.</p></section>" for h in _load_template_sections(kind))
    report = assemble_report_html(audit, sections)
    marks = re.findall(r'<svg class="alm-wordmark".*?</svg>', report)
    assert len(marks) == 2
    asset = (Path(__file__).resolve().parents[2] / "web/public/brand/alm-wordmark.svg").read_text()
    paths = re.findall(r'<path[^>]+/>', asset)
    assert paths and all(re.findall(r'<path[^>]+/>', mark) == paths for mark in marks)
    assert f'<title>@fictional_brand — AuditLayerMedia {kind.title()} Report</title>' in report
    assert f'AuditLayerMedia {kind.title()} Report' in report
    assert '<link ' not in report and '<image ' not in report
    assert 'Prompt v' not in report
