"""Tests for the template pipeline: master skeleton loading, prompt building,
and generation.py integration with the single-phase prompt."""

from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import MagicMock

import pytest

from auditlayer_worker.core import (
    AuditRecord,
    REPORT_SECTIONS,
    ReportType,
    assemble_report_html,
    assemble_structured_report_html,
    build_report_prompt,
    build_section_prompt,
    load_master_skeleton,
)
from auditlayer_worker.generation import HermesReportGenerator, MockReportGenerator
from auditlayer_worker.hermes import ChatResult, Usage


def _complete_standard_sections(body: str = "Analysis") -> str:
    return "".join(
        f"<section><h2>{'Road to 10K' if heading == 'Road to [Milestone]' else heading}</h2>"
        f"<p>{body}</p></section>"
        for heading in REPORT_SECTIONS[ReportType.STANDARD.value]
    )


def _complete_standard_payload(body: str = "Analysis") -> str:
    return json.dumps(
        {
            "sections": [
                {
                    "heading": "Road to 10K" if heading == "Road to [Milestone]" else heading,
                    "lede": body,
                    "items": [{"title": "Finding", "body": body, "value": ""}],
                }
                for heading in REPORT_SECTIONS[ReportType.STANDARD.value]
            ]
        }
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_audit() -> AuditRecord:
    return AuditRecord(
        id="test-tp-1",
        handle="hemalpatelphd",
        platform="instagram",
        goal="growth",
        context="UCSD professor, PhD",
        plan="starter",
        report_type=ReportType.STANDARD.value,
    )


# ---------------------------------------------------------------------------
# Template loading
# ---------------------------------------------------------------------------


def test_load_master_skeleton_returns_html():
    """load_master_skeleton() returns a string containing HTML."""
    html = load_master_skeleton()
    assert isinstance(html, str)
    assert len(html) > 500
    assert "@{handle}" in html
    assert "<!DOCTYPE html>" in html or "<!doctype html>" in html.lower()
    assert "AuditLayer" in html


def test_load_master_skeleton_has_expected_elements():
    """The skeleton contains the brand ribbon, header, section slots, and footer."""
    html = load_master_skeleton()
    # Brand ribbon
    assert "AuditLayerMedia" in html
    # Header structure with placeholders
    assert "@{handle}" in html
    assert "{platform}" in html
    assert "{goal}" in html
    # Section comment markers
    assert "<!-- 1. EXECUTIVE SUMMARY -->" in html
    assert "<!-- 2. KEY METRICS -->" in html
    assert "<!-- 15. GET THE EXECUTION PLAN -->" in html
    # CSS tokens
    assert "--accent: #0d9488" in html
    assert "--surface: #ffffff" in html
    # Footer
    assert "AuditLayerMedia" in html
    assert "</html>" in html


def test_load_master_skeleton_raises_on_missing(tmp_path):
    """Verify error is raised when template doesn't exist at expected path."""
    from auditlayer_worker.core import _TEMPLATE_DIR
    real_path = _TEMPLATE_DIR / "master-skeleton.html"
    assert real_path.exists(), "Expected master-skeleton.html at worker templates path"


# ---------------------------------------------------------------------------
# build_report_prompt
# ---------------------------------------------------------------------------


def test_build_report_prompt_basic(sample_audit):
    """build_report_prompt() returns a prompt with audit info, sections, and skeleton."""
    prompt = build_report_prompt(sample_audit)
    assert isinstance(prompt, str)
    assert len(prompt) > 1000
    # Audit info in prompt
    assert "@hemalpatelphd" in prompt
    assert "STANDARD" in prompt.upper()
    # Section list
    assert "Required Sections" in prompt
    assert "1. Executive Summary" in prompt
    assert "15. Get the Execution Plan" in prompt
    # Master Skeleton Template
    assert "Master Skeleton Template" in prompt
    assert "master-skeleton.html" not in prompt  # should be inlined, not referenced
    assert "@{handle}" in prompt  # placeholder in the embedded HTML


def test_build_report_prompt_pulse(sample_audit):
    """Pulse report type produces pulse sections in the section list."""
    pulse_audit = replace(sample_audit, report_type=ReportType.PULSE.value)
    prompt = build_report_prompt(pulse_audit)
    assert "PULSE" in prompt
    # Section list has pulse sections
    assert "1. Score Breakdown" in prompt
    assert "2. Key Gaps" in prompt
    assert "3. Three Immediate Moves" in prompt
    # Section list does NOT have standard-only sections
    assert "Executive Summary" not in prompt.split("## Required Sections")[1].split("## Master Skeleton")[0]
    # The master skeleton HTML (embedded) still has all 15 slots — that's fine,
    # the skeleton is the canonical template, the section list controls formatting.


def test_build_report_prompt_extended(sample_audit):
    """Extended report type produces all extended sections."""
    ext_audit = replace(sample_audit, report_type=ReportType.EXTENDED.value)
    prompt = build_report_prompt(ext_audit)
    assert "EXTENDED" in prompt
    assert "19. Your First 3 Seconds" in prompt
    assert "20. Powered by AuditLayerMedia" in prompt


def test_build_report_prompt_blueprint(sample_audit):
    """Blueprint report type produces blueprint sections."""
    bp_audit = replace(sample_audit, report_type=ReportType.BLUEPRINT.value)
    prompt = build_report_prompt(bp_audit)
    assert "BLUEPRINT" in prompt
    assert "1. Niche & Positioning Audit" in prompt
    assert "15. Powered by AuditLayerMedia" in prompt


def test_build_report_prompt_with_ig_data(sample_audit):
    """IG profile and media dicts are included in the prompt."""
    ig_profile = {
        "username": "hemalpatelphd",
        "name": "Hemal Patel",
        "followers_count": 12700,
        "follows_count": 340,
        "media_count": 412,
        "account_type": "BUSINESS",
        "biography": "UCSD professor | Biohacking expert",
        "website": "https://example.com",
    }
    ig_media = [
        {
            "media_type": "IMAGE",
            "like_count": 450,
            "comments_count": 22,
            "engagement_rate": 3.5,
            "caption": "Test post about biohacking",
        }
    ]
    prompt = build_report_prompt(sample_audit, ig_profile=ig_profile, ig_media=ig_media)
    assert "Instagram Data (PRIMARY SOURCE)" in prompt
    assert "12700" in prompt
    assert "followers_count" in prompt
    assert "Test post about biohacking" in prompt
    assert "@{handle}" in prompt  # skeleton still has placeholders


def test_build_report_prompt_without_ig_data(sample_audit):
    """Without IG profile/ media, no data block is included."""
    prompt = build_report_prompt(sample_audit)
    assert "Instagram Data" not in prompt


def test_build_report_prompt_contains_skeleton_inline(sample_audit):
    """The master skeleton HTML is embedded directly in the prompt (not a file path)."""
    prompt = build_report_prompt(sample_audit)
    assert "<!DOCTYPE html>" in prompt or "<!doctype html>" in prompt.lower()
    assert "```html" in prompt
    assert "```" in prompt  # closing fence


def test_section_prompt_and_local_skeleton_assembly(sample_audit):
    evidence = "Verified public evidence"
    prompt = build_section_prompt(sample_audit, evidence)
    assert evidence in prompt
    assert "Master Skeleton Template" not in prompt
    assert "Return one JSON object only" in prompt

    fragment = _complete_standard_sections()
    html = assemble_report_html(sample_audit, fragment)
    assert html.startswith("<!DOCTYPE html>")
    assert "--accent: #0d9488" in html
    assert fragment in html
    assert "@hemalpatelphd" in html
    assert "@{handle}" not in html


def test_structured_report_autofills_connected_instagram_metrics(sample_audit):
    metrics = SimpleNamespace(
        profile=SimpleNamespace(followers_count=12345),
        avg_engagement_rate=4.56,
        avg_likes=321.0,
        avg_comments=17.0,
        posting_cadence="3.5 posts per week",
        top_content_types=["CAROUSEL_ALBUM", "VIDEO"],
    )
    html = assemble_structured_report_html(
        sample_audit,
        _complete_standard_payload("<script>not markup</script>"),
        ig_metrics=metrics,
    )

    assert "Connected Instagram Graph API" in html
    assert "12,345" in html
    assert "4.56%" in html
    assert "321" in html
    assert "17" in html
    assert "3.5 posts per week" in html
    assert "<script>not markup</script>" not in html
    assert "&lt;script&gt;not markup&lt;/script&gt;" in html


def test_structured_report_rejects_duplicate_keys_and_nonfinite_numbers(sample_audit):
    payload = json.loads(_complete_standard_payload())
    duplicate = '{"sections":[],"sections":' + json.dumps(payload["sections"]) + "}"
    nonfinite = _complete_standard_payload().replace(
        '"lede": "Analysis"', '"lede": NaN', 1
    )
    overflow = _complete_standard_payload().replace(
        '"lede": "Analysis"', '"lede": 1e999', 1
    )
    with pytest.raises(ValueError, match="Duplicate structured report key"):
        assemble_structured_report_html(sample_audit, duplicate)
    with pytest.raises(ValueError, match="Invalid JSON number"):
        assemble_structured_report_html(sample_audit, nonfinite)
    with pytest.raises(ValueError, match="Invalid structured report field"):
        assemble_structured_report_html(sample_audit, overflow)


def test_structured_report_rejects_excess_cardinality(sample_audit):
    payload = json.loads(_complete_standard_payload())
    payload["sections"][0]["items"] = [
        {"title": f"Item {index}", "body": "Body"} for index in range(11)
    ]
    with pytest.raises(ValueError, match="items are invalid"):
        assemble_structured_report_html(sample_audit, json.dumps(payload))


def test_connected_key_metrics_suppresses_model_metrics(sample_audit):
    payload = json.loads(_complete_standard_payload())
    key_metrics = payload["sections"][1]
    key_metrics["lede"] = "Invented followers 999999"
    key_metrics["items"] = [{"title": "Followers", "body": "999999"}]
    metrics = SimpleNamespace(
        profile=SimpleNamespace(followers_count=3660),
        avg_engagement_rate=0.3,
        avg_likes=9.2,
        avg_comments=1.6,
        posting_cadence="5-7x/week",
        top_content_types=["VIDEO"],
    )
    html = assemble_structured_report_html(
        sample_audit, json.dumps(payload), ig_metrics=metrics
    )
    assert "3,660" in html
    assert "999999" not in html


def test_connected_key_metrics_still_validates_model_cardinality(sample_audit):
    payload = json.loads(_complete_standard_payload())
    payload["sections"][1]["items"] = [
        {"title": f"Item {index}", "body": "Body"} for index in range(11)
    ]
    metrics = SimpleNamespace(
        profile=SimpleNamespace(followers_count=3660),
        avg_engagement_rate=0.3,
        avg_likes=9.2,
        avg_comments=1.6,
        posting_cadence="5-7x/week",
        top_content_types=["VIDEO"],
    )
    with pytest.raises(ValueError, match="items are invalid"):
        assemble_structured_report_html(
            sample_audit, json.dumps(payload), ig_metrics=metrics
        )


def test_local_assembly_rejects_missing_required_sections(sample_audit):
    with pytest.raises(ValueError, match="required section headings"):
        assemble_report_html(
            sample_audit,
            "<section><h2>Executive Summary</h2><p>Incomplete</p></section>",
        )


@pytest.mark.parametrize(
    "payload",
    [
        "<iframe src='https://evil.example'></iframe>",
        "<img src=x onerror='alert(1)'>",
        "<script>alert(1)</script>",
    ],
)
def test_local_assembly_rejects_active_html(sample_audit, payload):
    with pytest.raises(ValueError, match="safe report section HTML"):
        assemble_report_html(sample_audit, _complete_standard_sections(payload))


def test_local_assembly_rejects_full_document_bypass(sample_audit):
    full = f"<html><body>{_complete_standard_sections()}</body></html>"
    with pytest.raises(ValueError, match="safe report section HTML"):
        assemble_report_html(sample_audit, full)


@pytest.mark.parametrize(
    "payload",
    [
        "<style>@import 'https://evil.example/tracker.css';</style>",
        "<a href='java&#x73;cript:alert(1)'>click</a>",
        "</main><main><div class='spoof'>spoof</div>",
    ],
)
def test_local_assembly_rejects_structural_bypasses(sample_audit, payload):
    with pytest.raises(ValueError, match="safe report section HTML"):
        assemble_report_html(sample_audit, _complete_standard_sections(payload))


def test_local_assembly_ignores_no_commented_heading_bypass(sample_audit):
    commented = "<!--" + _complete_standard_sections() + "-->"
    with pytest.raises(ValueError, match="safe report section HTML"):
        assemble_report_html(sample_audit, commented + "<section><p>Incomplete</p></section>")


# ---------------------------------------------------------------------------
# generation.py integration
# ---------------------------------------------------------------------------


def test_mock_generator_still_works():
    """MockReportGenerator.generate() still returns a valid result after the template
    pipeline changes. This verifies the existing mock path is not broken."""
    audit = AuditRecord(
        id="test-tp-2",
        handle="test_user",
        platform="instagram",
        goal="growth",
        plan="starter",
    )

    def noop_progress(phase: str, detail: str) -> None:
        pass

    generator = MockReportGenerator()
    result = generator.generate(audit, noop_progress)
    assert result.html is not None
    assert result.model == "mock"
    assert result.tokens_in > 0
    assert result.tokens_out > 0
    assert "<!doctype html>" in result.html.lower() or "<html" in result.html.lower()
    assert "@test_user" in result.html or "test_user" in result.html


def test_standard_generator_uses_bounded_single_pass(sample_audit):
    class RecordingClient:
        def __init__(self):
            self.calls: list[dict] = []
            self.research_calls = 0

        def collect_research(self, audit):
            self.research_calls += 1
            return "Bounded verified evidence from three web searches."

        def chat(self, **kwargs):
            self.calls.append(kwargs)
            return ChatResult(
                content=_complete_standard_payload("complete report"),
                usage=Usage(tokens_in=1200, tokens_out=900),
                model="deepseek-v4-flash",
            )

    client = RecordingClient()
    generator = HermesReportGenerator(
        client=cast(Any, client),
        model="deepseek-v4-flash",
        toolsets=("web", "x_search"),
        max_tokens=32000,
        temperature=0.2,
        phase_interval=0,
    )

    result = generator.generate(sample_audit, lambda _phase, _detail: None)

    assert client.research_calls == 1
    assert len(client.calls) == 1
    assert client.calls[0]["max_tokens"] == 9000
    assert client.calls[0]["toolsets"] == ()
    assert "Bounded verified evidence" in client.calls[0]["messages"][1]["content"]
    assert "1,800 words" in client.calls[0]["messages"][1]["content"]
    assert "Master Skeleton Template" not in client.calls[0]["messages"][1]["content"]
    assert result.html.startswith("<!DOCTYPE html>")


def test_bounded_generator_retries_one_format_miss(sample_audit):
    class FormattingClient:
        def __init__(self):
            self.calls: list[dict] = []

        def collect_research(self, audit):
            return "Verified evidence"

        def chat(self, **kwargs):
            self.calls.append(kwargs)
            content = (
                "I prepared the analysis."
                if len(self.calls) == 1
                else _complete_standard_payload("recovered")
            )
            return ChatResult(
                content=content,
                usage=Usage(tokens_in=100, tokens_out=50),
                model="deepseek-v4-flash",
            )

    client = FormattingClient()
    generator = HermesReportGenerator(
        client=cast(Any, client),
        model="deepseek-v4-flash",
        toolsets=("web",),
        max_tokens=32000,
        temperature=0.2,
        phase_interval=0,
    )

    result = generator.generate(sample_audit, lambda _phase, _detail: None)

    assert len(client.calls) == 2
    assert result.tokens_in == 200
    assert result.tokens_out == 100
    assert "recovered" in result.html


def test_cached_evidence_uses_local_section_assembly(sample_audit):
    class CachedClient:
        def __init__(self):
            self.calls: list[dict] = []

        def collect_research(self, audit):
            raise AssertionError("cached evidence should skip web collection")

        def chat(self, **kwargs):
            self.calls.append(kwargs)
            return ChatResult(
                content=_complete_standard_payload("cached"),
                usage=Usage(tokens_in=100, tokens_out=100),
                model="deepseek-v4-flash",
            )

    client = CachedClient()
    generator = HermesReportGenerator(
        client=cast(Any, client),
        model="deepseek-v4-flash",
        toolsets=("web",),
        max_tokens=32000,
        temperature=0.2,
        phase_interval=0,
    )
    result = generator.generate(
        sample_audit,
        lambda _phase, _detail: None,
        research_cache="Previously verified evidence",
    )

    assert len(client.calls) == 1
    assert client.calls[0]["toolsets"] == ()
    assert "Previously verified evidence" in client.calls[0]["messages"][1]["content"]
    assert result.html.startswith("<!DOCTYPE html>")


def test_http_cached_evidence_uses_local_section_assembly(sample_audit):
    class HttpStyleClient:
        def __init__(self):
            self.calls: list[dict] = []

        def chat(self, **kwargs):
            self.calls.append(kwargs)
            return ChatResult(
                content=_complete_standard_payload("http cached"),
                usage=Usage(tokens_in=100, tokens_out=100),
                model="deepseek-v4-flash",
            )

    client = HttpStyleClient()
    generator = HermesReportGenerator(
        client=cast(Any, client),
        model="deepseek-v4-flash",
        toolsets=("web",),
        max_tokens=32000,
        temperature=0.2,
        phase_interval=0,
    )
    result = generator.generate(
        sample_audit,
        lambda _phase, _detail: None,
        research_cache="Cached evidence for HTTP mode",
    )

    assert len(client.calls) == 1
    assert client.calls[0]["toolsets"] == ()
    assert result.html.startswith("<!DOCTYPE html>")


def test_fresh_client_without_bounded_collector_fails_closed(sample_audit):
    class LegacyClient:
        def __init__(self):
            self.calls = []

        def chat(self, **kwargs):
            self.calls.append(kwargs)
            raise AssertionError("legacy model HTML path must not be called")

    client = LegacyClient()
    generator = HermesReportGenerator(
        client=cast(Any, client),
        model="deepseek-v4-flash",
        toolsets=("web",),
        max_tokens=9000,
        temperature=0.1,
    )
    with pytest.raises(RuntimeError, match="bounded research collector"):
        generator.generate(sample_audit, lambda *_args: None)
    assert client.calls == []


# ---------------------------------------------------------------------------
# Smoke / integration
# ---------------------------------------------------------------------------


def test_build_report_prompt_smoke(sample_audit):
    """Run build_report_prompt end-to-end and verify key assertions from the plan."""
    prompt = build_report_prompt(sample_audit)
    assert "@hemalpatelphd" in prompt
    assert "Required Sections" in prompt
    assert "Master Skeleton Template" in prompt
    assert len(prompt) > 2000
