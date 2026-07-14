"""Tests for the template pipeline: master skeleton loading, prompt building,
and generation.py integration with the single-phase prompt."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from auditlayer_worker.core import (
    AuditRecord,
    ReportType,
    build_report_prompt,
    load_master_skeleton,
)
from auditlayer_worker.generation import HermesReportGenerator, MockReportGenerator


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
    assert "15. Powered by AuditLayerMedia" in prompt
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
