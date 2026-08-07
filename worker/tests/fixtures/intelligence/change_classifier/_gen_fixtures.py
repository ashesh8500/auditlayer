#!/usr/bin/env python3
"""Deterministic generator for the change-classifier fixture corpus.

Each fixture is a self-contained JSON document: {"metadata": {...}, "expected": {...}}.
The metadata mirrors ``ChangeMetadata`` exactly (including the extracted
``prior_evidence_hashes`` the runtime adapter passes); expected declares the
canonical classification contract the classifier must satisfy.

Synthetic only - no customer data. Fixtures prove the software contract, never
real creator change or causality. Run: python3 _gen_fixtures.py
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent

CURRENT_BRIEF = 2
CURRENT_METHODOLOGY = "moat-1"
H1 = "h" * 64 + "1"
H2 = "h" * 64 + "2"
H3 = "h" * 64 + "3"


def _doc(prior_result, prior_evidence_hashes, current_evidence_hashes, expected):
    return {
        "metadata": {
            "prior_result": prior_result,
            "prior_evidence_hashes": prior_evidence_hashes,
            "current_evidence_hashes": current_evidence_hashes,
            "current_brief_version": CURRENT_BRIEF,
            "current_methodology_version": CURRENT_METHODOLOGY,
        },
        "expected": expected,
    }


def _expected(cause, *, tip=False, supported=None):
    return {
        "cause": cause,
        "correction_tip_present": tip,
        "supported_causes": supported or [],
    }


# ---------------------------------------------------------------------------
# Four supported causes
# ---------------------------------------------------------------------------
def evidence_changed():
    """Only evidence content hashes differ -> evidence."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": False, "evidence_hashes": [H1, H2]},
        [H1, H2],
        [H1, H3],
        _expected("evidence", supported=["evidence"]),
    )


def brief_changed():
    """Only the brief version differs -> brief_lens."""
    return _doc(
        {"brief_version": 1, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": False, "evidence_hashes": [H1]},
        [H1],
        [H1],
        _expected("brief_lens", supported=["brief_lens"]),
    )


def methodology_changed():
    """Only the methodology version differs -> methodology."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": "moat-0",
         "prior_correction": False, "evidence_hashes": [H1]},
        [H1],
        [H1],
        _expected("methodology", supported=["methodology"]),
    )


def prior_correction():
    """The prior run was itself a correction -> prior_correction."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": True, "evidence_hashes": [H1]},
        [H1],
        [H1],
        _expected("prior_correction", supported=["prior_correction"]),
    )


# ---------------------------------------------------------------------------
# Honest UNKNOWN: first run, unchanged, absent, contradictory, malformed
# ---------------------------------------------------------------------------
def first_run_no_prior():
    """No prior result exists; a first run is not a delta -> UNKNOWN + tip."""
    return _doc(
        None,
        None,
        [H1],
        _expected("unknown", tip=True),
    )


def unchanged_metadata():
    """Prior matches current on every supported signal -> UNKNOWN + tip."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": False, "evidence_hashes": [H1, H2]},
        [H1, H2],
        [H1, H2],
        _expected("unknown", tip=True),
    )


def multiple_changed_brief_methodology():
    """Two causes change together -> contradictory -> UNKNOWN + tip."""
    return _doc(
        {"brief_version": 1, "methodology_version": "moat-0",
         "prior_correction": False, "evidence_hashes": [H1]},
        [H1],
        [H1],
        _expected("unknown", tip=True, supported=["brief_lens", "methodology"]),
    )


def multiple_changed_correction_evidence():
    """Prior correction plus new evidence -> contradictory -> UNKNOWN + tip."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": True, "evidence_hashes": [H1]},
        [H1],
        [H1, H3],
        _expected("unknown", tip=True, supported=["evidence", "prior_correction"]),
    )


def absent_evidence_hashes():
    """Prior metadata lacks evidence hashes -> evidence unsupported -> UNKNOWN + tip."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": False},
        None,
        [H1],
        _expected("unknown", tip=True),
    )


def malformed_evidence_hashes():
    """Prior evidence_hashes is not a hash list -> treated absent -> UNKNOWN + tip."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": False, "evidence_hashes": "not-a-list"},
        None,
        [H1],
        _expected("unknown", tip=True),
    )


def null_prior_versions():
    """Prior brief/methodology are null (unknown prior versions) -> UNKNOWN + tip."""
    return _doc(
        {"brief_version": None, "methodology_version": None, "prior_correction": False},
        None,
        [H1],
        _expected("unknown", tip=True),
    )


def reordered_evidence_hashes():
    """Same evidence set in a different order is NOT a change -> UNKNOWN + tip."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": False, "evidence_hashes": [H1, H2]},
        [H1, H2],
        [H2, H1],
        _expected("unknown", tip=True),
    )


def empty_prior_evidence_hashes():
    """Prior evidence set was empty and current has evidence -> evidence."""
    return _doc(
        {"brief_version": CURRENT_BRIEF, "methodology_version": CURRENT_METHODOLOGY,
         "prior_correction": False, "evidence_hashes": []},
        [],
        [H1],
        _expected("evidence", supported=["evidence"]),
    )


def prior_correction_only_with_null_versions():
    """Prior correction is the only supported signal even when versions are null."""
    return _doc(
        {"brief_version": None, "methodology_version": None, "prior_correction": True},
        None,
        [H1],
        _expected("prior_correction", supported=["prior_correction"]),
    )


FIXTURES = {
    "evidence_changed": evidence_changed,
    "brief_changed": brief_changed,
    "methodology_changed": methodology_changed,
    "prior_correction": prior_correction,
    "first_run_no_prior": first_run_no_prior,
    "unchanged_metadata": unchanged_metadata,
    "multiple_changed_brief_methodology": multiple_changed_brief_methodology,
    "multiple_changed_correction_evidence": multiple_changed_correction_evidence,
    "absent_evidence_hashes": absent_evidence_hashes,
    "malformed_evidence_hashes": malformed_evidence_hashes,
    "null_prior_versions": null_prior_versions,
    "reordered_evidence_hashes": reordered_evidence_hashes,
    "empty_prior_evidence_hashes": empty_prior_evidence_hashes,
    "prior_correction_only_with_null_versions": prior_correction_only_with_null_versions,
}


def main() -> None:
    for name, builder in FIXTURES.items():
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(builder(), indent=2, sort_keys=True) + "\n")
        print(f"wrote {path.name}")


if __name__ == "__main__":
    main()
