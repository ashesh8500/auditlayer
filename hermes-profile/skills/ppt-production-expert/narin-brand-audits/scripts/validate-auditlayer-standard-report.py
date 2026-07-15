#!/usr/bin/env python3
"""Validate an AuditLayer standard 15-section HTML report before delivery.

Usage:
    python3 scripts/validate-auditlayer-standard-report.py <report.html> [canonical-css-ref.html]

Arguments:
    report.html             Path to the generated AuditLayer HTML report.
    canonical-css-ref.html  Path to the canonical Hemal CSS reference file.
                            Defaults to the social-media-audit skill's references/hemal-report-format.html.
                            Only checks CSS byte-match when this arg is provided.

Checks:
    1. Exactly 15 <h2> headings matching the required strings character-for-character.
    2. Canonical CSS <style> block byte-for-byte match against the reference (if ref provided).
    3. Zero inline style="" attributes in the body.
    4. Zero <link> tags (no external assets).
    5. ALM badge, @auditlayermedia handle, IG camera SVG present.
    6. Execution-plan disclaimer text present.
    7. OAuth / data-quality note present.
    8. Six AuditLayer product questions present.
    9. Forbidden risky-phrase remnants absent (style=, one session, 150 accounts, 150 this week, ~7-8, 49x, 13+).

Exit code: 0 on all checks passing, 1 on any failure.
"""

import re
import sys
from pathlib import Path


REQUIRED_HEADINGS = [
    "Executive Summary",
    "Key Metrics",
    "Strengths",
    "Weaknesses",
    "Root Cause Analysis",
    "Peer Comparison",
    "Content Format Analysis",
    "Engagement Growth Strategy",
    "Quick Wins — This Week",
    "Success Benchmarks",
    "Audience Profile",
    "Road to [Milestone]",
    "Audit Cadence",
    "Footer",
    "Powered by AuditLayerMedia",
]

SIX_QUESTIONS = [
    "Where is this account right now",
    "What is holding it back",
    "Who is it actually for",
    "What should change first",
    "What does success look like",
    "What is the path",
]

RISKY_PHRASES = [
    r'style="[^"]*"',   # inline style attributes (check again explicitly)
    r"one session",
    r"150 accounts",
    r"150 this week",
    r"~7-8",
    r"49x",
    r"13\+",
]

DEFAULT_CSS_REF = Path.home() / ".hermes/skills/productivity/social-media-audit/references/hemal-report-format.html"

def anchor_css_block(text: str) -> str | None:
    """Extract the real <style> block, skipping any comment text that mentions <style>."""
    m = re.search(r"^<style>.*?</style>", text, re.S | re.M)
    return m.group(0) if m else None


def validate(report_path: str, css_ref_path: str | None) -> int:
    report = Path(report_path).read_text()
    failures = 0

    # 1. Headings
    h2s = re.findall(r"<h2>(.*?)</h2>", report)
    if len(h2s) != 15:
        print(f"FAIL: Expected 15 <h2> headings, found {len(h2s)}")
        failures += 1
    elif h2s != REQUIRED_HEADINGS:
        print("FAIL: Headings do not match required strings exactly:")
        for i, (got, want) in enumerate(zip(h2s, REQUIRED_HEADINGS)):
            if got != want:
                print(f"  [{i+1}] got:      {repr(got)}")
                print(f"       expected: {repr(want)}")
        failures += 1
    else:
        print("PASS: 15 headings match exactly")

    # 2. CSS byte-match
    if css_ref_path:
        ref_text = Path(css_ref_path).read_text()
        report_css = anchor_css_block(report)
        ref_css = anchor_css_block(ref_text)
        if not report_css:
            print("FAIL: Could not extract <style> block from report")
            failures += 1
        elif not ref_css:
            print("FAIL: Could not extract <style> block from reference")
            failures += 1
        elif report_css != ref_css:
            print(f"FAIL: CSS block does not match reference byte-for-byte (report: {len(report_css)} chars, ref: {len(ref_css)} chars)")
            failures += 1
        else:
            print(f"PASS: CSS block matches reference ({len(report_css)} chars)")
    else:
        print("SKIP: No CSS reference provided — skipping byte-match check")

    # 3. Inline styles
    inline = re.findall(r'\sstyle="[^"]*"', report)
    count = len(inline)
    if count > 0:
        print(f"FAIL: {count} inline style attribute(s) found")
        for s in inline:
            print(f"       {s[:100]}")
        failures += 1
    else:
        print("PASS: Zero inline style attributes")

    # 4. No external assets
    links = re.findall(r"<link[^>]*>", report)
    if links:
        print(f"FAIL: {len(links)} <link> tag(s) found (external assets)")
        for l in links:
            print(f"       {l[:120]}")
        failures += 1
    else:
        print("PASS: Zero <link> tags")

    # 5. ALM badge + handle + SVG
    checks = {
        "alm-badge": "alm-badge" in report,
        "@auditlayermedia": "@auditlayermedia" in report,
        "IG camera SVG": 'viewBox="0 0 24 24"' in report,
    }
    for label, ok in checks.items():
        if ok:
            print(f"PASS: {label} present")
        else:
            print(f"FAIL: {label} missing")
            failures += 1

    # 6. Execution-plan disclaimer
    if "This is an execution plan" in report:
        print("PASS: Execution-plan disclaimer present")
    else:
        print("FAIL: Execution-plan disclaimer missing")
        failures += 1

    # 7. OAuth / data-quality note
    if "OAuth" in report or "Data quality note" in report:
        print("PASS: OAuth or data-quality limitation flagged")
    else:
        print("WARN: No OAuth or data-quality note found")

    # 8. Six product questions
    missing_qs = [q for q in SIX_QUESTIONS if q not in report]
    if missing_qs:
        print(f"FAIL: {len(missing_qs)} of 6 product questions missing:")
        for q in missing_qs:
            print(f"       {q}")
        failures += 1
    else:
        print("PASS: All 6 product questions present")

    # 9. Risky phrase remnants
    risky_found = False
    for phrase in RISKY_PHRASES:
        hits = re.findall(phrase, report)
        if hits:
            print(f"FAIL: Risky phrase '{phrase}' found {len(hits)} time(s)")
            risky_found = True
    if not risky_found:
        print("PASS: No risky phrase remnants")
    if risky_found:
        failures += 1

    # Summary
    print()
    if failures == 0:
        print("ALL CHECKS PASSED")
        return 0
    else:
        print(f"{failures} CHECK(S) FAILED")
        return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    report_file = sys.argv[1]
    css_file = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_CSS_REF)

    if not Path(report_file).exists():
        print(f"ERROR: Report file not found: {report_file}")
        sys.exit(2)

    use_ref = Path(css_file).exists()
    if not use_ref and len(sys.argv) > 2:
        print(f"WARN: CSS reference not found at {css_file} — skipping CSS check")

    sys.exit(validate(report_file, css_file if use_ref else None))
