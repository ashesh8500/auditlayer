"""Deterministic, zero-token report quality gate."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import html
import re
from typing import Any


@dataclass(frozen=True)
class QualityResult:
    passed: bool
    score: int
    blockers: tuple[str, ...]
    warnings: tuple[str, ...]

    @property
    def summary(self) -> str:
        details = [*self.blockers, *self.warnings]
        return f"quality={self.score}/100" + (f"; {'; '.join(details)}" if details else "")


def _visible_text(report_html: str) -> str:
    without_active = re.sub(
        r"<(script|style)\b[^>]*>.*?</\1>", " ", report_html, flags=re.I | re.S
    )
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", without_active))).strip()


def evaluate_report_quality(
    report_html: str,
    *,
    report_type: str,
    ig_metrics: Any = None,
) -> QualityResult:
    blockers: list[str] = []
    warnings: list[str] = []
    lowered = report_html.lower()
    visible = _visible_text(report_html)

    if "</html>" not in lowered or "<section" not in lowered:
        blockers.append("incomplete report document")
    if "@{handle}" in report_html or "{{" in report_html or "}}" in report_html:
        blockers.append("unresolved template placeholder")
    if re.search(r"<(script|iframe|object|embed)\b", report_html, flags=re.I):
        blockers.append("active content survived sanitization")

    minimum_words = {
        "pulse": 80,
        "standard": 250,
        "extended": 400,
        "enterprise": 400,
        "blueprint": 250,
    }.get(report_type, 200)
    word_count = len(re.findall(r"\b[\w’'-]+\b", visible))
    if word_count < minimum_words:
        blockers.append(f"report too short ({word_count} words; minimum {minimum_words})")

    if ig_metrics is not None:
        profile = getattr(ig_metrics, "profile", None)
        followers = int(getattr(profile, "followers_count", 0) or 0)
        if followers and f"{followers:,}" not in visible and str(followers) not in visible:
            blockers.append("live follower count missing from rendered report")

    # Exact repeated sentences are a reliable low-false-positive signal for the
    # roadmap duplication Narin identified. Do not block stylistic short labels.
    sentences = [
        re.sub(r"\s+", " ", sentence).strip().lower()
        for sentence in re.split(r"(?<=[.!?])\s+", visible)
        if len(sentence.split()) >= 8
    ]
    repeated = [(sentence, count) for sentence, count in Counter(sentences).items() if count >= 3]
    if repeated:
        worst = max(count for _, count in repeated)
        message = f"repeated recommendation sentence ({worst} occurrences)"
        if worst >= 4:
            blockers.append(message)
        else:
            warnings.append(message)

    if not re.search(r"https?://|href=[\"']https?://", report_html, flags=re.I):
        warnings.append("no external source citation")

    score = max(0, 100 - 25 * len(blockers) - 5 * len(warnings))
    return QualityResult(
        passed=not blockers,
        score=score,
        blockers=tuple(blockers),
        warnings=tuple(warnings),
    )
