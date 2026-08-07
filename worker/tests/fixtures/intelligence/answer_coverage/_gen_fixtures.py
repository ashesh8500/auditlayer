#!/usr/bin/env python3
"""Deterministic generator for the answer-coverage fixture corpus.

Each fixture is a self-contained JSON document: {"payload": {...}, "evidence": {...}}.
Synthetic only - no customer data. Run: python3 _gen_fixtures.py
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
SUBJECT = "11111111-1111-4111-8111-111111111111"
SNAPSHOT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def _ev(evidence_id, observed, expires, confidence, *, source_type="connected_api",
        limitations=None, content_hash=None):
    return {
        "evidence_id": evidence_id,
        "observed_at": observed,
        "expires_at": expires,
        "confidence": confidence,
        "source_type": source_type,
        "content_hash": content_hash or ("a" * 64),
        "limitations": limitations or [],
    }


SHARED_EVIDENCE = {
    "ev-ig-profile-metrics": _ev(
        "ev-ig-profile-metrics", "2026-07-20T00:00:00Z", "2026-08-20T00:00:00Z", "authoritative"
    ),
    "ev-ig-content-mix": _ev(
        "ev-ig-content-mix", "2026-07-21T00:00:00Z", "2026-08-21T00:00:00Z", "high"
    ),
    "ev-bottleneck-analysis": _ev(
        "ev-bottleneck-analysis", "2026-07-22T00:00:00Z", "2026-08-22T00:00:00Z", "high"
    ),
    "ev-peer-benchmark": _ev(
        "ev-peer-benchmark", "2026-07-23T00:00:00Z", "2026-08-23T00:00:00Z", "medium",
        limitations=["Peer metrics are public best-effort snapshots."],
    ),
    "ev-milestone-trend": _ev(
        "ev-milestone-trend", "2026-07-24T00:00:00Z", "2026-08-24T00:00:00Z", "medium",
        source_type="methodology",
        limitations=["Projection assumes current cadence."],
    ),
    "ev-money-move": _ev(
        "ev-money-move", "2026-07-25T00:00:00Z", "2026-08-25T00:00:00Z", "high"
    ),
}


def _payload(answers):
    return {
        "schema_version": "1.0",
        "subject_id": SUBJECT,
        "brief_version": 4,
        "evidence_snapshot_id": SNAPSHOT,
        "answers": answers,
    }


def _doc(answers, evidence=None):
    return {"payload": _payload(answers), "evidence": evidence or SHARED_EVIDENCE}


def _answered(kind, claims, limitations=None, summary="Summary", headline="Headline"):
    return {
        "answer_kind": kind,
        "state": "answered",
        "headline": headline,
        "summary": summary,
        "claims": claims,
        "limitations": limitations or [],
    }


def _data_needed(kind, limitations=None):
    return {
        "answer_kind": kind,
        "state": "data_needed",
        "headline": "",
        "summary": "",
        "claims": [],
        "limitations": limitations or ["Data needed"],
    }


# ---------------------------------------------------------------------------
# 1. valid_all_six — one fixture covers all six answer kinds, all answered
# ---------------------------------------------------------------------------
def valid_all_six():
    return _doc({
        "current_state": _answered(
            "current_state",
            [
                {"claim_kind": "metric", "statement": "12.4K followers as of the latest snapshot.",
                 "evidence_ids": ["ev-ig-profile-metrics"], "value": 12400, "unit": "followers"},
                {"claim_kind": "metric", "statement": "4.8% engagement rate over 30 days.",
                 "evidence_ids": ["ev-ig-profile-metrics", "ev-ig-content-mix"], "value": 4.8, "unit": "percent"},
                {"claim_kind": "finding", "statement": "Carousel-first mix with weekly Reels.",
                 "evidence_ids": ["ev-ig-content-mix"]},
            ],
            summary="12.4K followers, 4.8% engagement, carousel-first content engine.",
        ),
        "blockers": _answered(
            "blockers",
            [
                {"claim_kind": "finding", "statement": "2.1 posts/week versus 4+ peer median.",
                 "evidence_ids": ["ev-bottleneck-analysis", "ev-peer-benchmark"]},
                {"claim_kind": "score_rationale", "statement": "Reach score of 41 reflects thin distribution.",
                 "evidence_ids": ["ev-bottleneck-analysis"], "score_dimension": "reach"},
            ],
            summary="Inconsistent cadence and uneven Reel distribution cap reach.",
        ),
        "better_peers": _answered(
            "better_peers",
            [
                {"claim_kind": "comparison", "statement": "Peer A publishes 4.5 posts/week at 5.2% engagement.",
                 "evidence_ids": ["ev-peer-benchmark"], "peer_reference": "peer-a"},
            ],
            limitations=["Peer metrics are public best-effort snapshots."],
            summary="Same-tier peers outpace on cadence and lab B-roll depth.",
        ),
        "next_week_actions": _answered(
            "next_week_actions",
            [
                {"claim_kind": "recommendation", "statement": "Publish a paper-breakdown carousel Tuesday.",
                 "evidence_ids": ["ev-ig-content-mix", "ev-bottleneck-analysis"], "horizon": "this_week"},
                {"claim_kind": "recommendation", "statement": "Film behind-the-lab Reel for Thursday.",
                 "evidence_ids": ["ev-bottleneck-analysis", "ev-peer-benchmark"], "horizon": "this_week"},
            ],
            summary="Ship one paper carousel and one behind-the-lab Reel.",
        ),
        "milestone_path": _answered(
            "milestone_path",
            [
                {"claim_kind": "metric", "statement": "20K followers in ~14 weeks at current cadence.",
                 "evidence_ids": ["ev-milestone-trend", "ev-ig-profile-metrics"], "value": 14, "unit": "weeks"},
            ],
            limitations=["Projection assumes current posting cadence."],
            summary="20K in ~14 weeks at current cadence; ~8 weeks at 4x/week.",
        ),
        "money_move": _answered(
            "money_move",
            [
                {"claim_kind": "recommendation", "statement": "Launch $249 cohort anchored to paper breakdowns.",
                 "evidence_ids": ["ev-money-move", "ev-ig-content-mix"], "horizon": "next_quarter"},
            ],
            summary="Cohort offer built on the demonstrated research-breakdown engine.",
        ),
    })


# ---------------------------------------------------------------------------
# 2. honest_null_data_needed — some answers are explicitly Data needed
# ---------------------------------------------------------------------------
def honest_null():
    return _doc({
        "current_state": _answered(
            "current_state",
            [
                {"claim_kind": "metric", "statement": "12.4K followers as of the latest snapshot.",
                 "evidence_ids": ["ev-ig-profile-metrics"], "value": 12400, "unit": "followers"},
            ],
            summary="12.4K followers with connected API metrics.",
        ),
        "blockers": _data_needed(
            "blockers",
            ["Data needed", "No connected cadence history; cannot diagnose the reach ceiling."],
        ),
        "better_peers": _data_needed("better_peers", ["Data needed"]),
        "next_week_actions": _answered(
            "next_week_actions",
            [
                {"claim_kind": "recommendation", "statement": "Publish a paper-breakdown carousel Tuesday.",
                 "evidence_ids": ["ev-ig-content-mix"], "horizon": "this_week"},
            ],
            summary="Ship the paper carousel from the verified content engine.",
        ),
        "milestone_path": _data_needed(
            "milestone_path",
            ["Data needed", "Trend history is unavailable; milestone projection deferred."],
        ),
        "money_move": _answered(
            "money_move",
            [
                {"claim_kind": "recommendation", "statement": "Launch $249 cohort anchored to paper breakdowns.",
                 "evidence_ids": ["ev-money-move", "ev-ig-content-mix"], "horizon": "next_quarter"},
            ],
            summary="Cohort offer built on the demonstrated research-breakdown engine.",
        ),
    })


# ---------------------------------------------------------------------------
# 3. invalid_unknown_evidence — a material claim references an unknown ID
# ---------------------------------------------------------------------------
def invalid_unknown_evidence():
    answers = valid_all_six()["payload"]["answers"]
    answers["current_state"]["claims"][0]["evidence_ids"] = ["ev-does-not-exist"]
    return _doc(answers)


# ---------------------------------------------------------------------------
# 4. invalid_missing_evidence — a material claim carries no evidence ids
# ---------------------------------------------------------------------------
def invalid_missing_evidence():
    answers = valid_all_six()["payload"]["answers"]
    answers["next_week_actions"]["claims"][0]["evidence_ids"] = []
    return _doc(answers)


# ---------------------------------------------------------------------------
# 5. invalid_stale_without_limitation — fresh evidence id used after expiry,
#    with no limitation naming the stale evidence id
# ---------------------------------------------------------------------------
def invalid_stale_without_limitation():
    answers = valid_all_six()["payload"]["answers"]
    answers["current_state"]["claims"][0]["evidence_ids"] = ["ev-stale-metrics"]
    evidence = dict(SHARED_EVIDENCE)
    evidence["ev-stale-metrics"] = _ev(
        "ev-stale-metrics", "2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z", "high"
    )
    return _doc(answers, evidence=evidence)


# ---------------------------------------------------------------------------
# 6. invalid_fabricated_precision — data_needed answer carries a material claim
# ---------------------------------------------------------------------------
def invalid_fabricated_precision():
    answers = valid_all_six()["payload"]["answers"]
    answers["better_peers"] = {
        "answer_kind": "better_peers",
        "state": "data_needed",
        "headline": "",
        "summary": "",
        "claims": [
            {"claim_kind": "metric", "statement": "Peer engagement is 6.1%.",
             "evidence_ids": ["ev-peer-benchmark"], "value": 6.1, "unit": "percent"},
        ],
        "limitations": ["Data needed"],
    }
    return _doc(answers)


# ---------------------------------------------------------------------------
# 7. invalid_incomplete_provenance — evidence record missing confidence
# ---------------------------------------------------------------------------
def invalid_incomplete_provenance():
    answers = valid_all_six()["payload"]["answers"]
    evidence = dict(SHARED_EVIDENCE)
    broken = dict(SHARED_EVIDENCE["ev-money-move"])
    del broken["confidence"]
    evidence["ev-money-move"] = broken
    return _doc(answers, evidence=evidence)


# ---------------------------------------------------------------------------
# 8. invalid_answered_without_claims — answered state with zero material claims
# ---------------------------------------------------------------------------
def invalid_answered_without_claims():
    answers = valid_all_six()["payload"]["answers"]
    answers["money_move"] = {
        "answer_kind": "money_move",
        "state": "answered",
        "headline": "The money move is a cohort.",
        "summary": "Launch a paid cohort.",
        "claims": [],
        "limitations": [],
    }
    return _doc(answers)


FIXTURES = {
    "valid_all_six": valid_all_six,
    "honest_null_data_needed": honest_null,
    "invalid_unknown_evidence": invalid_unknown_evidence,
    "invalid_missing_evidence": invalid_missing_evidence,
    "invalid_stale_without_limitation": invalid_stale_without_limitation,
    "invalid_fabricated_precision": invalid_fabricated_precision,
    "invalid_incomplete_provenance": invalid_incomplete_provenance,
    "invalid_answered_without_claims": invalid_answered_without_claims,
}


def main() -> None:
    for name, builder in FIXTURES.items():
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(builder(), indent=2, sort_keys=True) + "\n")
        print(f"wrote {path.name}")


if __name__ == "__main__":
    main()
