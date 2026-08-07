#!/usr/bin/env python3
"""Deterministic generator for the standard-report golden projection fixture.

ALM-I-007 honest-null report quality harness. The golden fixture is a full
15-section standard report rendered through the *canonical renderer*
(``auditlayer_worker.core.assemble_structured_report_html``) from structured
sections derived from the W001 typed six-answer corpus
(``fixtures/intelligence/answer_coverage/*.json``). All data is synthetic; the
fixture proves the rendering/validation contract only.

The golden uses the ``honest_null_data_needed`` typed fixture as its authority:
current_state / next_week_actions / money_move are answered, and blockers /
better_peers / milestone_path are honest-null (``Data needed``). The rendered
date is pinned so the fixture is byte-deterministic.

Run from ``worker/``:  uv run python tests/fixtures/report_quality/_gen_golden.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from auditlayer_worker.core import (
    SCORE_DIMENSIONS,
    AuditRecord,
    assemble_structured_report_html,
)

OUT = Path(__file__).resolve().parent
TYPED_FIXTURES = OUT.parent / "intelligence" / "answer_coverage"

PINNED_DATE = "August 01, 2026"


def _load(name: str) -> dict:
    return json.loads((TYPED_FIXTURES / name).read_text())


def _typed_answers() -> dict:
    """Authoritative typed six-answer payload (honest-null corpus)."""
    return _load("honest_null_data_needed.json")["payload"]["answers"]


def _section(heading: str, lede: str, items=None, *, table=None, callout=None) -> dict:
    return {
        "heading": heading,
        "lede": lede,
        "items": items or [],
        **({"table": table} if table else {}),
        **({"callout": callout} if callout else {}),
    }


def build_sections() -> list[dict]:
    answers = _typed_answers()
    current_state = answers["current_state"]
    blockers = answers["blockers"]
    next_week = answers["next_week_actions"]
    money_move = answers["money_move"]

    # Executive Summary: score diagram derived from the canonical dimensions;
    # the current-state answer supplies the lede.
    score_items = [
        {"title": title, "body": "Evidence-backed dimension score.", "value": str(55 + index * 3)}
        for index, (title, _weight) in enumerate(SCORE_DIMENSIONS)
    ]

    return [
        _section(
            "Executive Summary",
            current_state["summary"],
            score_items,
        ),
        _section(
            "Key Metrics",
            "Connected API snapshot metrics.",
            [
                {"title": "12,400", "body": "Followers", "value": ""},
                {"title": "4.8%", "body": "Engagement rate", "value": ""},
                {"title": "Carousel-first", "body": "Format mix", "value": ""},
            ],
            table={
                "headers": ["Metric", "Value", "Window"],
                "rows": [
                    ["Followers", "12,400", "Snapshot"],
                    ["Engagement rate", "4.8%", "30 days"],
                    ["Cadence", "2.1 posts/week", "30 days"],
                ],
            },
        ),
        _section(
            "Strengths",
            "Observed strengths from the evidence snapshot.",
            [
                {"title": "Carousel-first content engine", "body": "Carousel-first mix with weekly Reels.", "value": ""},
                {"title": "Healthy engagement base", "body": "4.8% engagement over 30 days.", "value": ""},
                {"title": "Clear niche signal", "body": "Research-breakdown positioning is distinct.", "value": ""},
            ],
        ),
        _section(
            "Weaknesses",
            blockers["limitations"][1] if len(blockers["limitations"]) > 1 else "Data needed",
            [],
            callout="Data needed — No connected cadence history; cannot diagnose the reach ceiling.",
        ),
        _section(
            "Root Cause Analysis",
            "Data needed — Trend and cadence history is unavailable for this snapshot.",
        ),
        _section(
            "Peer Comparison",
            "Data needed — Same-tier peer benchmarks are not yet verifiable for this snapshot.",
        ),
        _section(
            "Content Format Analysis",
            "Format mix derived from the verified content snapshot.",
            [
                {"title": "Reels", "body": "Weekly Reels anchor reach.", "value": ""},
                {"title": "Carousels", "body": "Paper breakdowns drive saves.", "value": ""},
            ],
        ),
        _section(
            "Engagement Growth Strategy",
            "Prioritized strategy levers.",
            [
                {"title": "Raise cadence", "body": "Move from two to four posts per week.", "value": "P1"},
                {"title": "Double down on Reels", "body": "Film behind-the-lab content weekly.", "value": "P2"},
            ],
        ),
        _section(
            "Content Calendar & Creative Board",
            "Weekly rhythm from the content engine.",
            [
                {"title": "Paper breakdown", "body": "Tuesday carousel from the verified content engine.", "value": "Educational & Strategy"},
                {"title": "Behind-the-lab", "body": "Thursday Reel filmed in the lab.", "value": "Portfolio & Proof"},
                {"title": "Question box", "body": "Saturday community poll story.", "value": "Engagement & Community"},
                {"title": "Milestone teaser", "body": "Sunday countdown to the next milestone.", "value": "Growth & Reach"},
            ],
            table={
                "headers": ["Day", "Format", "Pillar", "Asset"],
                "rows": [
                    ["Tue", "Carousel", "Educational & Strategy", "Paper breakdown"],
                    ["Thu", "Reel", "Portfolio & Proof", "Behind-the-lab"],
                    ["Sat", "Story", "Engagement & Community", "Question box"],
                    ["Sun", "Story", "Growth & Reach", "Milestone teaser"],
                ],
            },
        ),
        _section(
            "Quick Wins — This Week",
            "Ship these two this week.",
            [
                {"title": "Paper-breakdown carousel", "body": "Publish a paper-breakdown carousel Tuesday.", "value": ""},
                {"title": "Behind-the-lab Reel", "body": "Film behind-the-lab Reel for Thursday.", "value": ""},
            ],
        ),
        _section(
            "Success Benchmarks",
            "Benchmarks by tier for the verified niche.",
            [],
            table={
                "headers": ["Metric", "Median", "Strong", "Status"],
                "rows": [
                    ["Cadence", "3 posts/wk", "5 posts/wk", "Below"],
                    ["Engagement", "3.5%", "6%", "Above"],
                    ["Reel share", "40%", "60%", "Below"],
                    ["Followers", "10K", "50K", "Below"],
                    ["Avg likes", "300", "900", "At"],
                    ["Avg saves", "25", "80", "At"],
                    ["Offer clarity", "Medium", "High", "At"],
                    ["Email capture", "None", "Weekly", "Below"],
                    ["Partnerships", "None", "Monthly", "Below"],
                ],
            },
        ),
        _section(
            "Audience Profile",
            "Audience composition from public signals.",
            [
                {"title": "Primary audience", "body": "Biohacking and longevity enthusiasts.", "value": ""},
                {"title": "Decision drivers", "body": "Evidence depth and research credibility.", "value": ""},
            ],
        ),
        _section(
            "Road to 20K Followers",
            "Data needed — Trend history is unavailable; milestone projection deferred.",
        ),
        _section(
            "Audit Cadence",
            "Suggested re-audit rhythm.",
            [
                {"title": "Next audit", "body": "Re-run in four weeks after the cadence change.", "value": ""},
            ],
        ),
        _section(
            "Get the Execution Plan",
            money_move["summary"],
            [
                {"title": "Launch $249 cohort", "body": "Cohort offer built on the demonstrated research-breakdown engine.", "value": "$249"},
            ],
            callout=money_move["summary"],
        ),
    ]


def build_golden() -> str:
    audit = AuditRecord(
        id="golden-alm-i-007",
        handle="creator",
        platform="instagram",
        goal="growth",
        milestone_label="20K Followers",
        report_type="standard",
    )
    html = assemble_structured_report_html(
        audit,
        json.dumps({"sections": build_sections()}),
    )
    # Pin the rendered date so the fixture is byte-deterministic across runs.
    pinned, count = re.subn(
        r"\b[A-Z][a-z]{2,8} \d{1,2}, \d{4}\b",
        PINNED_DATE,
        html,
        count=4,  # ribbon + data notice + header meta + footer
    )
    if count == 0:
        raise RuntimeError("expected a rendered date to pin")
    return pinned


def main() -> None:
    golden = build_golden()
    path = OUT / "standard_golden.html"
    path.write_text(golden, encoding="utf-8")
    print(f"wrote {path.name} ({len(golden)} bytes)")
    print(f"15-section count: {golden.count('<section>')}")
    print(f"has print css: {'@media print' in golden}")


if __name__ == "__main__":
    main()
