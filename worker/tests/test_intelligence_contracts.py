from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from uuid import UUID

import pytest

from auditlayer_worker.intelligence import (
    CacheKeyParts,
    EvidenceValidationError,
    build_analysis_cache_key,
    normalize_evidence,
    project_subject_context,
    validate_channel_analysis,
)


SUBJECT_ID = "11111111-1111-4111-8111-111111111111"
CHANNEL_ID = "22222222-2222-4222-8222-222222222222"


def test_evidence_normalization_is_canonical_and_source_time_is_preserved() -> None:
    observed_at = datetime(2026, 7, 23, 1, 2, 3, tzinfo=timezone.utc)
    first = normalize_evidence(
        subject_id=SUBJECT_ID,
        channel_id=CHANNEL_ID,
        source_type="official_web",
        source_url="HTTPS://Example.COM:443/about#team",
        observed_at=observed_at,
        confidence="high",
        payload={"title": " About   Us ", "followers": 1234},
        coverage={"profile": True},
    )
    second = normalize_evidence(
        subject_id=SUBJECT_ID,
        channel_id=CHANNEL_ID,
        source_type="official_web",
        source_url="https://example.com/about",
        observed_at=observed_at,
        confidence="high",
        payload={"followers": 1234, "title": "About Us"},
        coverage={"profile": True},
    )

    assert first == second
    assert first["schema_version"] == "1.0"
    assert first["observed_at"] == "2026-07-23T01:02:03Z"
    assert first["source_url"] == "https://example.com/about"
    assert len(first["content_hash"]) == 64
    UUID(first["evidence_id"])


def test_evidence_rejects_untyped_or_secret_bearing_payloads() -> None:
    with pytest.raises(EvidenceValidationError, match="unsupported source_type"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=None,
            source_type="scraped_guess",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={},
        )

    with pytest.raises(EvidenceValidationError, match="sensitive key"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=None,
            source_type="user_context",
            observed_at="2026-07-23T01:02:03Z",
            confidence="authoritative",
            payload={"access_token": "do-not-store"},
        )


def test_context_projection_is_allowlisted_bounded_and_does_not_mutate_input() -> None:
    context = {
        "schema_version": "1.0",
        "subject_id": SUBJECT_ID,
        "version": 4,
        "subject_type": "creator",
        "identity": {"name": "Ada", "private_note": "internal"},
        "audience": {"primary": "founders", "raw_emails": ["x@example.com"]},
        "positioning": {"statement": "Evidence first"},
        "offers": ["Advisory"],
        "goals": ["Grow qualified reach"],
        "constraints": ["No paid acquisition"],
        "experiments": [{"name": "weekly video", "status": "active", "debug": "x"}],
        "decisions": [{"decision": "Avoid hype", "status": "confirmed", "internal": "x"}],
        "channels": [
            {
                "channel_id": CHANNEL_ID,
                "channel_type": "website",
                "locator": "https://example.com",
                "managed": True,
                "credential": "secret",
            }
        ],
        "service_role_key": "never project",
    }
    original = deepcopy(context)

    projection = project_subject_context(context, channel_ids=[CHANNEL_ID], max_chars=2_000)

    assert context == original
    assert projection["identity"] == {"name": "Ada"}
    assert projection["audience"] == {"primary": "founders"}
    assert projection["channels"][0] == {
        "channel_id": CHANNEL_ID,
        "channel_type": "website",
        "locator": "https://example.com",
        "managed": True,
    }
    assert "service_role_key" not in projection
    assert projection["experiments"] == [{"name": "weekly video", "status": "active"}]


def test_cache_key_changes_when_any_canonical_component_changes() -> None:
    base = CacheKeyParts(
        subject_id=SUBJECT_ID,
        channel_id=CHANNEL_ID,
        brief_version=4,
        evidence_hashes=("a" * 64, "b" * 64),
        methodology_version="moat-1",
        expertise_pack_version="wellness-3",
        prompt_version="1.0",
        model_provider="deepseek",
        model_name="deepseek-v4-flash",
        model_config_hash="c" * 64,
        output_schema_version="1.0",
        projection_version="1.0",
    )
    expected = build_analysis_cache_key(base)

    for field, replacement in {
        "subject_id": "33333333-3333-4333-8333-333333333333",
        "channel_id": "44444444-4444-4444-8444-444444444444",
        "brief_version": 5,
        "evidence_hashes": ("a" * 64,),
        "methodology_version": "moat-2",
        "expertise_pack_version": "wellness-4",
        "prompt_version": "1.1",
        "model_provider": "other",
        "model_name": "other-model",
        "model_config_hash": "d" * 64,
        "output_schema_version": "2.0",
        "projection_version": "2.0",
    }.items():
        values = dict(base.__dict__)
        values[field] = replacement
        assert build_analysis_cache_key(CacheKeyParts(**values)) != expected

    reordered = CacheKeyParts(**{**base.__dict__, "evidence_hashes": tuple(reversed(base.evidence_hashes))})
    assert build_analysis_cache_key(reordered) == expected


def test_analysis_validation_requires_every_reference_to_resolve() -> None:
    output = {
        "schema_version": "1.0",
        "channel_type": "website",
        "evidence_coverage": {"used": ["ev-1"], "unavailable": []},
        "findings": [
            {
                "id": "finding-1",
                "claim": "The homepage states the offer.",
                "evidence_ids": ["ev-missing"],
                "confidence": "high",
                "dimension_impacts": {"profile_clarity": 20},
            }
        ],
        "recommendations": [],
        "limitations": [],
    }

    with pytest.raises(EvidenceValidationError, match="unknown evidence ID"):
        validate_channel_analysis(output, evidence_ids={"ev-1"}, expected_channel_type="website")
