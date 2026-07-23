"""Canonical evidence normalization for the intelligence runtime."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Any, Mapping
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid5


EVIDENCE_SCHEMA_VERSION = "1.0"
EVIDENCE_NAMESPACE = UUID("5a663e30-d8a8-4d0a-9274-2dbf2be1f187")
SOURCE_TYPES = frozenset(
    {"connected_api", "official_web", "public_web", "user_context", "methodology"}
)
CONFIDENCE_LEVELS = frozenset({"low", "medium", "high", "authoritative"})
_SENSITIVE_KEY = re.compile(
    r"(?:^|_)(?:access_?token|refresh_?token|api_?key|authorization|credential|password|secret|cookie)(?:$|_)",
    re.IGNORECASE,
)


class EvidenceValidationError(ValueError):
    """A typed intelligence payload violates a deterministic contract."""


def _uuid(value: str, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise EvidenceValidationError(f"{field} must be a UUID") from exc


def _timestamp(value: datetime | str) -> str:
    if isinstance(value, str):
        raw = value.replace("Z", "+00:00")
        try:
            value = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise EvidenceValidationError("observed_at must be an ISO-8601 timestamp") from exc
    if value.tzinfo is None:
        raise EvidenceValidationError("observed_at must include a timezone")
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _canonical_url(value: str | None) -> str | None:
    if value is None:
        return None
    parsed = urlsplit(str(value).strip())
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise EvidenceValidationError("source_url must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password:
        raise EvidenceValidationError("source_url must not contain credentials")
    scheme = parsed.scheme.lower()
    hostname = parsed.hostname.lower().rstrip(".")
    port = parsed.port
    netloc = hostname if port is None or (scheme, port) in {("http", 80), ("https", 443)} else f"{hostname}:{port}"
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit((scheme, netloc, path, parsed.query, ""))


def _normalize_json(value: Any, *, key: str = "payload") -> Any:
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for raw_key in sorted(value, key=lambda item: str(item)):
            name = str(raw_key)
            if _SENSITIVE_KEY.search(name):
                raise EvidenceValidationError(f"{key} contains sensitive key {name!r}")
            normalized[name] = _normalize_json(value[raw_key], key=f"{key}.{name}")
        return normalized
    if isinstance(value, (list, tuple)):
        return [_normalize_json(item, key=key) for item in value]
    if isinstance(value, str):
        return " ".join(value.split())
    if value is None or isinstance(value, (bool, int, float)):
        return value
    raise EvidenceValidationError(f"{key} contains unsupported value type {type(value).__name__}")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def normalize_evidence(
    *,
    subject_id: str,
    channel_id: str | None,
    source_type: str,
    observed_at: datetime | str,
    confidence: str,
    payload: Mapping[str, Any],
    source_url: str | None = None,
    expires_at: datetime | str | None = None,
    coverage: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Return one immutable, content-addressed evidence-v1 packet.

    Observation time is part of identity and is never renewed during cache reuse.
    UUIDv5 makes retries idempotent without random IDs.
    """

    if source_type not in SOURCE_TYPES:
        raise EvidenceValidationError(f"unsupported source_type: {source_type}")
    if confidence not in CONFIDENCE_LEVELS:
        raise EvidenceValidationError(f"unsupported confidence: {confidence}")
    if not isinstance(payload, Mapping):
        raise EvidenceValidationError("payload must be an object")

    normalized_payload = _normalize_json(deepcopy(payload))
    normalized_coverage = _normalize_json(deepcopy(coverage or {}), key="coverage")
    normalized_subject_id = _uuid(subject_id, "subject_id")
    normalized_channel_id = _uuid(channel_id, "channel_id") if channel_id else None
    normalized_observed_at = _timestamp(observed_at)
    normalized_source_url = _canonical_url(source_url)
    normalized_expires_at = _timestamp(expires_at) if expires_at is not None else None

    content_document = {
        "subject_id": normalized_subject_id,
        "channel_id": normalized_channel_id,
        "source_type": source_type,
        "source_url": normalized_source_url,
        "observed_at": normalized_observed_at,
        "confidence": confidence,
        "coverage": normalized_coverage,
        "payload": normalized_payload,
    }
    content_hash = hashlib.sha256(canonical_json(content_document).encode("utf-8")).hexdigest()
    evidence_id = str(uuid5(EVIDENCE_NAMESPACE, content_hash))
    result: dict[str, Any] = {
        "schema_version": EVIDENCE_SCHEMA_VERSION,
        "evidence_id": evidence_id,
        **content_document,
        "expires_at": normalized_expires_at,
        "content_hash": content_hash,
    }
    return result
