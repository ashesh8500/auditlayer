"""Deterministic audit-to-audit change classification.

P2 · C5 · F5: each material score delta is classified from pinned
prior/current metadata as ``evidence``, ``brief_lens``, ``methodology``,
or ``prior_correction`` ONLY when that cause is supported. Missing,
contradictory, or multiply changed metadata produces explicit UNKNOWN
plus a correction tip; it never defaults silently to evidence.

The four supported causes are the exact values the production kernel
persists (``scores.change_kind`` CHECK constraint and ``record_scores``
RPC). UNKNOWN is an in-memory classification that is projected to the
nullable/limitation path at the ledger boundary — it never widens the
production schema.

Fixtures prove classification behavior, not real creator change or
causality. The classifier is deterministic and order-insensitive: it
compares sets of evidence content hashes, not their ordering.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

#: Persisted change_kind vocabulary shared with the kernel SQL constraint.
CHANGE_KINDS = frozenset({"evidence", "brief_lens", "methodology", "prior_correction"})
#: In-memory honest classification when no single cause is supported.
UNKNOWN_CHANGE = "unknown"
#: Complete in-memory classification vocabulary.
VALID_CAUSES = frozenset(CHANGE_KINDS | {UNKNOWN_CHANGE})


@dataclass(frozen=True)
class ChangeMetadata:
    """Pinned prior/current metadata one audit-to-audit delta is judged on.

    ``prior_result`` is the pinned prior run result (Mapping or None on a
    first run). ``prior_evidence_hashes`` is the pinned prior evidence
    content-hash set extracted from prior state; ``None`` means the prior
    metadata does not carry evidence hashes, so the evidence cause cannot
    be supported. ``current_evidence_hashes`` come from the current run's
    validated channels.
    """

    prior_result: Mapping[str, Any] | None
    prior_evidence_hashes: tuple[str, ...] | None
    current_evidence_hashes: tuple[str, ...]
    current_brief_version: int
    current_methodology_version: str


@dataclass(frozen=True)
class DeltaClassification:
    """One deterministic change classification for the run's score deltas.

    ``cause`` is one of ``CHANGE_KINDS`` or ``UNKNOWN_CHANGE``.
    ``correction_tip`` is non-empty exactly when ``cause`` is UNKNOWN and
    names what metadata is missing/conflicting so the caller can correct it.
    ``supported_causes`` is the sorted tuple of causes actually supported by
    the pinned metadata: a single cause for a supported classification, the
    conflicting causes for multi-cause UNKNOWN, and empty when no cause is
    supported (first run, unchanged, or absent metadata).
    """

    cause: str
    correction_tip: str | None
    supported_causes: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.cause not in VALID_CAUSES:
            raise ValueError(f"unknown change cause: {self.cause!r}")
        if self.cause == UNKNOWN_CHANGE:
            if not isinstance(self.correction_tip, str) or not self.correction_tip.strip():
                raise ValueError("UNKNOWN change classification requires a non-empty correction tip")
        elif self.correction_tip is not None:
            raise ValueError("supported change causes must not carry a correction tip")
        if not all(cause in CHANGE_KINDS for cause in self.supported_causes):
            raise ValueError("supported_causes must be persisted change kinds")


def _unknown(tip: str) -> DeltaClassification:
    return DeltaClassification(cause=UNKNOWN_CHANGE, correction_tip=" ".join(tip.split()))


def classify_change(metadata: ChangeMetadata) -> DeltaClassification:
    """Classify one audit-to-audit delta from pinned prior/current metadata.

    Rules:

    - No prior result (first run): UNKNOWN with a correction tip; never a
      silent ``evidence`` default.
    - A supported cause is emitted only when its metadata signal is present
      and differs: evidence hashes differ, brief version differs,
      methodology version differs, or the prior run was itself a correction.
    - Zero supported causes (missing or unchanged metadata): UNKNOWN with a
      correction tip naming the absent or matching metadata.
    - More than one supported cause (contradictory/multiple change): UNKNOWN
      with a correction tip naming the conflicting causes. Ordering never
      changes the verdict — the supported set is sorted before decision.
    """

    prior = metadata.prior_result
    if not isinstance(prior, Mapping):
        return _unknown(
            "No prior result exists; this is a first run, not an audit-to-audit delta. "
            "Attribution requires a pinned prior result."
        )

    supported: list[str] = []
    if prior.get("prior_correction") is True:
        supported.append("prior_correction")
    prior_methodology = prior.get("methodology_version")
    if isinstance(prior_methodology, str) and prior_methodology != metadata.current_methodology_version:
        supported.append("methodology")
    prior_brief = prior.get("brief_version")
    if isinstance(prior_brief, int) and prior_brief != metadata.current_brief_version:
        supported.append("brief_lens")
    if metadata.prior_evidence_hashes is not None:
        if set(metadata.prior_evidence_hashes) != set(metadata.current_evidence_hashes):
            supported.append("evidence")

    ordered = tuple(sorted(supported))
    if len(ordered) == 1:
        return DeltaClassification(cause=ordered[0], correction_tip=None, supported_causes=ordered)
    if len(ordered) > 1:
        tip = " ".join(
            (
                "Multiple supported causes conflict ("
                + ", ".join(ordered)
                + "); the delta cannot be attributed to a single cause."
            ).split()
        )
        return DeltaClassification(
            cause=UNKNOWN_CHANGE,
            correction_tip=tip,
            supported_causes=ordered,
        )

    missing: list[str] = []
    if not isinstance(prior.get("brief_version"), int):
        missing.append("prior brief version")
    if not isinstance(prior.get("methodology_version"), str):
        missing.append("prior methodology version")
    if metadata.prior_evidence_hashes is None:
        missing.append("prior evidence hashes")
    if missing:
        detail = "prior metadata is missing " + ", ".join(missing)
    else:
        detail = (
            "pinned prior metadata matches the current run "
            "(evidence, brief, and methodology unchanged)"
        )
    return _unknown(
        f"No supported change cause: {detail}; the delta cannot be attributed. "
        "Correct the pinned prior metadata or treat the delta as unexplained."
    )
