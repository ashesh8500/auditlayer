# Report Verification Checklist

Run this after writing ANY AuditLayer HTML report — standard, pulse, opportunity, or contract.
Catches the three most common structural bugs before delivery.

## Quick check (30 seconds)

```python
with open("<report-path>.html") as f:
    html = f.read()

# 1. Div balance — stray </div> breaks layout from the section onward
opens = html.count("<div")
closes = html.count("</div>")
assert opens == closes, f"DIV MISMATCH: {opens} opens, {closes} closes"

# 2. Section count — missing/extra <section> means structure is wrong
sec_opens = html.count("<section>")
sec_closes = html.count("</section>")
assert sec_opens == sec_closes, f"SECTION MISMATCH: {sec_opens} opens, {sec_closes} closes"

# 3. ALM footer badge — non-negotiable on every report
assert 'alm-badge' in html, "MISSING: ALM badge"
assert '@auditlayermedia' in html, "MISSING: @auditlayermedia handle"
assert 'viewBox="0 0 24 24"' in html, "MISSING: IG camera SVG"

print("OK — div balance, section count, ALM badge all present")
```

## Full check (when debugging or after major edits)

```python
import re

with open("<report-path>.html") as f:
    html = f.read()

# --- Section headings ---
h2s = re.findall(r'<h2>(.*?)</h2>', html)
print(f"Found {len(h2s)} H2 sections:")
for i, h in enumerate(h2s, 1):
    print(f"  {i}. '{h.strip()}'")

# Check against expected headings list
# For standard 15-section: Executive Summary, Key Metrics, Strengths,
# Weaknesses, Root Cause Analysis, Peer Comparison, Content Format Analysis,
# Engagement Growth Strategy, Quick Wins — This Week, Success Benchmarks,
# Audience Profile, Road to [Milestone], Audit Cadence, Footer,
# Powered by AuditLayerMedia
```

## Section-by-section div balance (when hunting a stray `</div>`)

```python
html = open("<report-path>.html").read()
body_start = html.find("<body>")
body_end = html.find("</body>")
body = html[body_start:body_end]

for i, sec in enumerate(body.split("<section>")):
    opens = sec.count("<div")
    closes = sec.count("</div")
    if opens != closes:
        h2_match = re.search(r'<h2>(.*?)</h2>', sec)
        h2 = h2_match.group(1) if h2_match else "NO H2"
        print(f"S{i}: {opens} opens, {closes} closes | {h2}")
```

**False positive — section 15 (last section) will often show +1 close**: The container `<div class="container">` that wraps the entire report body is opened before the first `<section>` (in element 0 of the split) but closed AFTER the last `</section>`. When splitting on `<section>`, this closing `</div>` lands in the last section's split segment, making it appear imbalanced (e.g., 2 opens, 3 closes). This is NOT a bug — verify with the full-body div balance check (`opens == closes`) instead. The body-level check is the authoritative diagnostic.

## Common fixes

- **Stray `</div>` before `</section>`** — usually section 7 (Content Ideas). Remove the extra `</div>` line.
- **Extra `</div>` after last card in a grid** — count cards vs closing divs in the sw-grid/rec-card section.
- **Missing `</section>`** — `search_files` for `<section>` and count opens vs closes by hand.
