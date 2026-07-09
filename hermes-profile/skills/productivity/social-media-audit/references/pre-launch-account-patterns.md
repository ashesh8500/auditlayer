# Pre-Launch Account Patterns

Three distinct pre-launch archetypes encountered in AuditLayer reports. Each requires different scoring calibration, peer strategy, and report framing.

## Archetype 1: Clean Pre-Launch (Never Posted)

**Signature:** Instagram URL resolves. Profile is publicly accessible. 0 posts, 0 followers, 0 following. No prior content in Google index. Handle is intentional and brandable. Bio may or may not be populated.

**Scoring baseline:** 8–15/100. Growth Potential is the standout dimension; everything else is at floor.

**Peer strategy:** Same-tier peers are functionally invisible to web search (0-follower accounts have zero SEO footprint). After 3+ attempts, pivot to off-tier accounts in the 100–500 follower range — these represent the first achievable milestone. Always state follower counts and be transparent about the tier gap.

**Report framing:** Launch activation playbook. Every section answers "what to do from scratch." The 90-day map starts at Day 1 of posting. The 1% Compounding Move is always "post within 24 hours and set 3x/week minimum."

---

## Archetype 2: Test-and-Delete (Posted Then Purged)

**Signature:** Instagram URL resolves. Profile is publicly accessible. 0 posts, 0 followers, 0 following — BUT Google's index shows prior activity. Search for the handle returns individual post URLs with engagement metrics (typically 0–2 likes). Post pages return "Post isn't available" or redirect to login. The indexed content reveals the creator's interests and content experiments.

**Key difference from Clean Pre-Launch:** The deletion pattern is diagnostic. It signals either perfectionism paralysis (post → judge → delete → repeat) or strategy whiplash (tried direction A, scrapped it, tried direction B). This goes in the Weaknesses section as a structural risk: the same pattern that killed the first batch of content can kill the second.

**Scoring baseline:** 10–18/100. Slightly higher than Clean Pre-Launch because indexed content provides niche validation and content-range insight. But the inconsistency penalty offsets some of that.

**Peer strategy:** Same as Clean Pre-Launch — off-tier accounts with stated counts. Use the indexed content themes to calibrate peer selection (match the niche the creator is already orbiting).

**Report framing:** Launch playbook + pattern interrupt. Acknowledge the deleted content in the Raw Numbers section (it's research data). Add a specific weakness: "Deleted Prior Content Signals Inconsistency." Frame the clean slate as an advantage — but warn that the same deletion impulse will sabotage growth. The 1% Compounding Move is "post and leave it up — do not delete for 30 days, no matter how it performs."

---

## Archetype 3: Login-Walled Invisible

**Signature:** Instagram URL resolves (not "page not available"). Browser navigation confirms login-wall redirect (URL contains `/accounts/login/`, title is "Instagram" not a profile name). Handle is brandable and intentional — no numeric suffix, no "test" component. ALL research methods return zero data (see `login-walled-invisible-account.md` for the full protocol).

**Scoring baseline:** 4.5/100. Honest floor score with documented research failure log.

**Peer strategy:** Use industry benchmarks and generic niche peers. Real handles may not be verifiable — note this in the report.

**Report framing:** Activation playbook with Decision Gate ("Activate or Rebrand?"). The audit IS the finding — the account's invisibility is the primary diagnostic. See `login-walled-invisible-account.md` for the full protocol.

---

## Peer Selection at 0 Followers — Practical Rules

When the subject has 0 followers and the skill mandates "Named peers over archetypes — MANDATORY":

1. **Try 3–5 passes** for sub-500-follower accounts in the niche. Accept that most will fail — these accounts have no search index.
2. **Pivot to off-tier accounts** in the 100–3,000 follower range. These are findable via web search and browser verification (og:description meta tag).
3. **Verify every peer's follower count** via `browser_navigate` + `browser_console` expression `document.querySelector('meta[property="og:description"]')?.content`. Do not trust search results or prior audits.
4. **State the tier gap explicitly** in the peer comparison section. Callout: "These accounts are at the tier @handle can realistically reach in 90–180 days. True 0-follower peers are invisible to search — but the strategic value of comparing to accounts at the near-term milestone is higher than comparing to no one."
5. **Frame peers as "first milestone targets," not competitors.** For pre-launch accounts, peer comparison is aspirational benchmarking, not competitive analysis.

## Milestone Calculation for Pre-Launch Accounts

- **0 followers → target 100 followers** (Phase 1, Day 30)
- **0 followers → target 250 followers** (Phase 2, Day 60)
- **0 followers → target 500 followers** (Phase 3, Day 90)

These scale with the account. A 500-follower account's Road to 2K looks different. Never hardcode; always compute from current tier.
