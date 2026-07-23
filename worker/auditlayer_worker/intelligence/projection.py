"""Deterministic, bounded Living Brief projection."""

from __future__ import annotations

from copy import deepcopy
import json
from typing import Any, Iterable, Mapping

from .evidence import EvidenceValidationError, canonical_json


PROJECTION_VERSION = "1.0"
_TOP_LEVEL = (
    "schema_version",
    "subject_id",
    "version",
    "subject_type",
    "identity",
    "audience",
    "positioning",
    "offers",
    "goals",
    "constraints",
    "experiments",
    "decisions",
    "channels",
)
_OBJECT_FIELDS = {
    "identity": ("name", "display_name", "description", "category", "location"),
    "audience": ("primary", "secondary", "needs", "geographies"),
    "positioning": ("statement", "differentiators", "proof_points"),
}
_LIST_OBJECT_FIELDS = {
    "experiments": ("name", "hypothesis", "status", "started_at", "ended_at"),
    "decisions": ("decision", "status", "reason", "decided_at"),
}
_CHANNEL_FIELDS = ("channel_id", "channel_type", "locator", "managed")


def _pick(value: Any, fields: Iterable[str]) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    return {field: deepcopy(value[field]) for field in fields if field in value}


def _clean_strings(value: Any, *, max_items: int = 20, max_length: int = 500) -> list[str]:
    if not isinstance(value, list):
        return []
    return [" ".join(str(item).split())[:max_length] for item in value[:max_items]]


def project_subject_context(
    context: Mapping[str, Any],
    *,
    channel_ids: Iterable[str],
    max_chars: int = 12_000,
) -> dict[str, Any]:
    """Build the only Living Brief shape inference may see.

    Unknown/internal fields are dropped rather than recursively copied. Oversized
    projections fail closed so truncation cannot silently change strategic meaning.
    """

    selected = set(channel_ids)
    projected: dict[str, Any] = {
        key: deepcopy(context[key]) for key in _TOP_LEVEL[:4] if key in context
    }
    for key, fields in _OBJECT_FIELDS.items():
        projected[key] = _pick(context.get(key), fields)
    for key in ("offers", "goals", "constraints"):
        projected[key] = _clean_strings(context.get(key))
    for key, fields in _LIST_OBJECT_FIELDS.items():
        rows = context.get(key)
        projected[key] = (
            [_pick(row, fields) for row in rows[:20] if isinstance(row, Mapping)]
            if isinstance(rows, list)
            else []
        )
    channels = context.get("channels")
    projected["channels"] = (
        [
            _pick(row, _CHANNEL_FIELDS)
            for row in channels
            if isinstance(row, Mapping) and row.get("channel_id") in selected
        ]
        if isinstance(channels, list)
        else []
    )
    size = len(canonical_json(projected).encode("utf-8"))
    if size > max_chars:
        raise EvidenceValidationError(
            f"subject context projection exceeds {max_chars} bytes"
        )
    return json.loads(canonical_json(projected))
