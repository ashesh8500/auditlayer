from __future__ import annotations

from concurrent.futures import Future
import json
from pathlib import Path
from typing import Any, cast

import pytest

from auditlayer_worker.core import AuditRecord, REPORT_SECTIONS
from auditlayer_worker.generation import (
    GenerationStageError,
    HermesReportGenerator,
    _append_evidence_sources,
    _filter_evidence_payload,
    _indexed_instagram_metrics,
    _safe_evidence_sources,
)
from auditlayer_worker.hermes import ChatResult, Usage


def _audit(report_type: str = "standard") -> AuditRecord:
    return AuditRecord(
        id=f"runtime-{report_type}",
        handle="example",
        platform="instagram",
        goal="growth",
        plan="pro",
        report_type=report_type,
        limitations=[],
        milestone_label="10K",
    )


def _payload(report_type: str = "standard", body: str = "Evidence-backed analysis") -> str:
    sections = []
    for heading in REPORT_SECTIONS[report_type]:
        visible_heading = "Road to 10K" if heading == "Road to [Milestone]" else heading
        items = (
            [
                {"title": title, "body": body, "value": str(55 + index * 3)}
                for index, title in enumerate(
                    (
                        "Profile Clarity",
                        "Content Quality",
                        "Content Consistency",
                        "Audience Fit",
                        "Engagement Health",
                        "Growth Readiness",
                        "Conversion Path",
                        "Brand Differentiation",
                    )
                )
            ]
            if heading == "Executive Summary"
            else [{"title": "Finding", "body": body, "value": ""}]
        )
        sections.append({"heading": visible_heading, "lede": body, "items": items})
    return json.dumps({"sections": sections})


class _Client:
    def __init__(self, responses: list[str | Exception]) -> None:
        self.responses = responses
        self.calls: list[dict[str, Any]] = []
        self.research_calls = 0

    def collect_research(self, _audit: AuditRecord) -> str:
        self.research_calls += 1
        return json.dumps(
            {
                "web": [
                    {
                        "url": "https://www.instagram.com/reel/a/",
                        "title": "Example on Instagram",
                        "description": "Evidence A for example on Instagram",
                    },
                    {
                        "url": "https://www.instagram.com/reel/b/",
                        "title": "Example on Instagram",
                        "description": "Evidence B for example on Instagram",
                    },
                ]
            }
        )

    def chat(self, **kwargs: Any) -> ChatResult:
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return ChatResult(
            content=response,
            usage=Usage(tokens_in=1_200, tokens_out=800),
            model="deepseek-v4-flash",
        )


def _generator(client: _Client, *, instagram_timeout_seconds: float = 0.05) -> HermesReportGenerator:
    return HermesReportGenerator(
        client=cast(Any, client),
        model="deepseek-v4-flash",
        toolsets=("web",),
        max_tokens=9_000,
        temperature=0.2,
        phase_interval=0,
        instagram_timeout_seconds=instagram_timeout_seconds,
    )


def test_success_records_bounded_stage_metrics() -> None:
    client = _Client([_payload()])
    result = _generator(client).generate(_audit(), lambda *_args: None)

    assert client.research_calls == 1
    assert result.tokens_in == 1_200
    assert result.tokens_out == 800
    assert result.evidence_items == 2
    assert result.format_retry_used is False
    assert result.research_cache_used is False
    assert result.account_mode == "public_instagram"
    assert set(result.stage_timings) >= {"research", "analysis", "validation"}
    assert all(value >= 0 for value in result.stage_timings.values())
    assert 'data-source-kind="public_research"' in result.html
    assert "https://www.instagram.com/reel/a/" in result.html


def test_format_retry_is_bounded_and_accounted() -> None:
    client = _Client(["not json", _payload(body="Recovered analysis")])
    result = _generator(client).generate(_audit(), lambda *_args: None)

    assert len(client.calls) == 2
    assert result.tokens_in == 2_400
    assert result.tokens_out == 1_600
    assert result.format_retry_used is True
    assert "format_correction" in result.stage_timings


def test_analysis_failure_carries_reusable_research_checkpoint() -> None:
    client = _Client([TimeoutError("provider stalled")])

    with pytest.raises(GenerationStageError) as caught:
        _generator(client).generate(_audit(), lambda *_args: None)

    failure = caught.value
    assert failure.stage == "analysis"
    assert failure.error_code == "analysis_timeout"
    assert failure.retryable is True
    assert json.loads(failure.research_cache)["web"]
    assert failure.stage_timings["research"] >= 0


def test_invalid_correction_is_retryable_and_keeps_checkpoint() -> None:
    client = _Client(["not json", "still not json"])

    with pytest.raises(GenerationStageError) as caught:
        _generator(client).generate(_audit(), lambda *_args: None)

    failure = caught.value
    assert failure.stage == "format_correction"
    assert failure.error_code == "structured_output_invalid"
    assert failure.retryable is True
    assert failure.tokens_in == 2_400
    assert failure.tokens_out == 1_600
    assert failure.research_cache


def test_connected_metrics_wait_has_a_hard_timeout() -> None:
    client = _Client([_payload()])
    pending: Future[Any] = Future()

    with pytest.raises(GenerationStageError) as caught:
        _generator(client, instagram_timeout_seconds=0.01).generate(
            _audit(),
            lambda *_args: None,
            ig_future=pending,
        )

    failure = caught.value
    assert failure.stage == "connected_metrics"
    assert failure.error_code == "connected_metrics_timeout"
    assert failure.retryable is True
    assert failure.research_cache
    assert client.calls == []


def test_report_profile_enforces_single_api_attempt_and_timeout() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    config = (repo_root / "hermes-profile" / "profiles" / "report" / "config.yaml").read_text()

    assert "api_max_retries: 1" in config
    assert "request_timeout_seconds: 150" in config
    assert "stale_timeout_seconds: 120" in config
    assert "max_turns: 3" in config


def test_runtime_metrics_migration_is_private_and_reaps_stale_runs() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    migration = (
        repo_root
        / "supabase"
        / "migrations"
        / "20260723120000_report_generation_runtime_metrics.sql"
    ).read_text()

    assert "create table if not exists public.report_generation_runs" in migration.lower()
    assert "enable row level security" in migration.lower()
    assert "revoke all on public.report_generation_runs from public, anon" in migration.lower()
    assert "reap_stale_report_generation_runs" in migration
    assert "grant execute" in migration.lower()


def test_automatic_retry_budget_is_one() -> None:
    from auditlayer_worker.core import MAX_RETRIES

    assert MAX_RETRIES == 1


def test_citation_projection_rejects_script_credentials_and_duplicates() -> None:
    sources = _safe_evidence_sources(
        {
            "web": [
                {
                    "title": "Safe",
                    "url": "https://example.com/report",
                    "evidence_mode": "public_search_index",
                },
                {"title": "Duplicate", "url": "https://example.com/report"},
                {"title": "Script", "url": "javascript:alert(1)"},
                {"title": "Credentials", "url": "https://user@example.com/private"},
            ]
        }
    )
    assert sources == [
        ("Safe", "https://example.com/report", "public_search_index")
    ]


def test_public_index_provenance_survives_visible_citation_projection() -> None:
    html = _append_evidence_sources(
        "<html><body></body></html>",
        [("Indexed result", "https://example.com/result", "public_search_index")],
        connected_metrics=False,
    )

    assert 'data-source-kind="public_search_index"' in html
    assert 'data-source-kind="public_research"' not in html
    assert "Public search index snapshot" in html


def test_cached_evidence_is_filtered_before_prompt_or_citation_use() -> None:
    filtered = _filter_evidence_payload(
        {
            "web": [
                {
                    "url": "https://github.com/other/hungerdeck-tools",
                    "title": "HungerDeck software",
                    "description": "A different software project",
                },
                {
                    "url": "https://www.instagram.com/reel/ABC/",
                    "title": "Instagram",
                    "description": "57 likes - hungerdeck on Instagram",
                    "evidence_mode": "public_search_index",
                },
            ]
        },
        handle="hungerdeck",
        platform="instagram",
    )

    assert [row["url"] for row in filtered["web"]] == [
        "https://www.instagram.com/reel/ABC/"
    ]


def test_indexed_instagram_metrics_require_attributable_public_index_evidence() -> None:
    payload = {
        "web": [
            {
                "url": "https://www.instagram.com/reel/ABC/",
                "title": "Instagram",
                "description": "57 likes, 29 comments - hungerdeck on June 28, 2026.",
                "evidence_mode": "public_search_index",
            },
            {
                "url": "https://example.com/generic",
                "title": "Generic engagement calculator",
                "description": "2.7% engagement and 99,999 followers",
                "evidence_mode": "public_search_index",
            },
        ]
    }

    assert _indexed_instagram_metrics(payload, "hungerdeck") == {
        "likes": "57",
        "comments": "29",
    }
