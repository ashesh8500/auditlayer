"""Exact cache identities for validated channel analysis."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib

from .evidence import canonical_json


@dataclass(frozen=True)
class CacheKeyParts:
    subject_id: str
    channel_id: str
    brief_version: int
    evidence_hashes: tuple[str, ...]
    methodology_version: str
    expertise_pack_version: str
    prompt_version: str
    model_provider: str
    model_name: str
    model_config_hash: str
    output_schema_version: str
    projection_version: str
    projected_context_hash: str
    evidence_freshness: tuple[str, ...]
    prior_state_hash: str


def build_analysis_cache_key(parts: CacheKeyParts) -> str:
    """Hash every canonical reuse component; omission means no cache hit."""

    document = asdict(parts)
    document["evidence_hashes"] = sorted(set(parts.evidence_hashes))
    document["evidence_freshness"] = sorted(parts.evidence_freshness)
    return hashlib.sha256(canonical_json(document).encode("utf-8")).hexdigest()
