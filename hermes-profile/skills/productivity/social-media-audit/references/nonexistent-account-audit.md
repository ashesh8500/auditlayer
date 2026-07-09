# Auditing a Non-Existent Account — Pre-Launch Assessment

When the subject handle does not exist on the primary platform (or any platform), and the handle is clean/collision-free, this is a pre-launch assessment — not an underperforming account, not a dormant account, not a collision. The account was simply never created or was deleted.

## Detection Signals

The account must fail ALL of the following across multiple platforms:

| Platform | Non-Existence Signal | Method |
|----------|---------------------|--------|
| Instagram | "Page isn't available" in browser title | `browser_navigate` → `browser_console` with `expression="document.title"` |
| Instagram | No `og:description` meta tag; 302 redirect to login | `curl -sI` → 302, `curl | grep og:description` → empty |
| X/Twitter | FxTwitter returns `{"code":404,"message":"User not found"}` | `curl -sL "https://api.fxtwitter.com/<handle>"` |
| X/Twitter (supplemental) | TwStalker shows bare 0/0/0 profile with no join date and no bio — this is a ghost/residual entry, NOT a dormant account | `curl -sL "https://twstalker.com/<handle>"` — run after FxTwitter to detect ghost profiles |
| TikTok | Profile page returns generic "TikTok - Make Your Day" title | `curl -sL | grep '<title>'` |
| YouTube | HTTP 404 at `/@<handle>` | `curl -sI` → 404 |
| GitHub | HTTP 404 | `curl -sI` → 404 |
| Reddit | 301 redirect; search API returns empty | Reddit search API + direct profile URL |

**Critical distinction from dormant accounts:** A dormant account EXISTS (FxTwitter returns 200 with zero metrics; TwStalker shows join date). A non-existent account was NEVER created (FxTwitter returns 404; TwStalker typically returns nothing). The pivot strategies are different.

**Edge case — FxTwitter 404 + TwStalker residual profile:** TwStalker can show a bare 0/0/0 profile (zero tweets, zero followers, zero following) with no bio and no join date even when FxTwitter returns a definitive 404. This is a ghost/residual entry — likely an auto-provisioned handle via Twitter API that was never activated, or a cached placeholder. The resolution rule: FxTwitter 404 takes precedence. A bare TwStalker profile with all-zero metrics AND no join date AND no bio is functionally nonexistent. Document this in the platform audit table and note that the handle may need a variation when claiming on X (e.g., drop the underscore or append an alternative suffix). Do NOT treat this as a dormant account — dormant accounts have a join date and FxTwitter returns 200.

**Critical distinction from handle collision:** A collided handle is buried under search results for other content. A non-existent handle is simply absent — there is nothing to collide WITH. The handle is clean and available.

## Cross-Platform Verification Protocol

When Instagram returns "Page isn't available," verify 3+ other platforms before declaring the account non-existent:

1. FxTwitter API (highest-signal single check): 404 = definitive non-existence on X
2. YouTube: direct HTTP check for 404
3. TikTok: title check for generic "TikTok - Make Your Day" vs. account-specific title
4. GitHub: 404 = non-existence
5. Browser confirmation on Instagram: `browser_console` with `document.title` — "Page isn't available • Instagram" is the definitive Instagram signal

If ALL platforms return non-existence, pivot to pre-launch assessment.

## Pivot Strategy

Frame the audit as a **pre-launch assessment**, not a performance evaluation.

### Brand Snapshot Adaptation

Replace "founded, HQ, product, pricing" with:
- Handle availability status across all platforms
- Handle collision risk assessment (web search for competing entities)
- Domain availability (check verifyworking.com, verify.work, etc.)
- Handle quality assessment (clean? memorable? no special chars? no numbers?)

### Executive Summary Framing

Open with: "@handle does not exist on [primary platform] — or any major social platform." State the verified absence as the primary finding. Frame the report as "this is a pre-launch assessment that evaluates the handle as a brand asset and provides a complete launch playbook."

### Data Notice

Always include a Data Notice callout documenting how non-existence was verified (specific platforms, methods, returned signals). This is not a data gap — it's a verified absence.

### Strengths & Weaknesses Adaptation

**Strengths** frame around handle quality and positional freedom:
- Clean, memorable handle (no numbers, no special characters)
- Zero negative baggage
- Complete platform availability (can claim everywhere simultaneously)
- No audience to lose (experimentation is risk-free)
- Flexible positioning (handle supports multiple niches)
- Handle symmetry across platforms
- No competitive collision
- Domain optionality

**Weaknesses** frame around activation gaps:
- Complete absence of social proof
- No profile optimization
- Zero content library
- No brand identity (undefined niche, tone, visual style)
- Absent across all platforms
- No website or external destination
- Algorithmic cold start
- No community engagement
- No differentiation strategy
- No monetization infrastructure

### Positioning Analysis

Since the account has no content, analyze what niches the handle NATURALLY suggests. For a handle like "verify_working":
- Employment verification / background checks
- QA testing / software quality
- Productivity tools / remote work verification
- General "proving things work" review content

Present 2-3 positioning options with audience psychology breakdowns for each. Recommend one as the strongest launch positioning and explain why.

### Peer Comparison

Use projected maturity stages (archetypes) rather than real accounts. There is nothing to compare directly. Structure as:

| Attribute | Current (0) | Phase 1 Target (Month 3) | Phase 2 Target (Month 6) | Phase 3 Target (Month 12) |

Include a callout: "Direct peer comparison is impossible with zero content. These archetypes represent realistic growth trajectories if the account is activated with consistent execution."

### Scoring

Baseline for a completely non-existent account: **4/100**

| Dimension | Score | Reason |
|-----------|-------|--------|
| Growth Potential | 3/15 | Handle is clean + flexible positioning + no collision = structural potential |
| Competitive Positioning | 0.5/5 | Handle has positional advantage (no collision) but no executed positioning |
| Branding & Messaging | 0.5/10 | Handle exists as a concept only |
| All other dimensions | 0 | Nothing to measure |

Explicitly note: "This is the mathematically correct baseline for an account that does not exist. It is not a verdict — it is a starting point. Re-measure at Days 30, 60, and 90."

### Growth Bottlenecks

The #1 bottleneck is always: "Account does not exist" — CRITICAL severity, LOW fix difficulty (1 day to create). Frame this honestly — it's the truth and the easiest bottleneck to resolve.

### Road to Milestone

Use "Road to 1,000 Followers" as the default milestone for a zero-follower launch. Structure in 3 phases:
- Phase 1 (Days 1–14): Foundation — create accounts, design brand, produce first 10 posts
- Phase 2 (Days 15–45): Activation — daily Reels, comment strategy, cross-platform
- Phase 3 (Days 46–90): Flywheel — recurring series, collaborations, email capture

### Content Ideas

Generate 10 specific launch-content ideas — not format-archetypes but concrete pieces tied to the chosen positioning niche. Include format, expected length, and the virality mechanism for each.

### 1% Compounding Move

The move is always: "Create the account today. Post the first Reel within 24 hours." Frame the urgency: every day of non-existence is irrecoverable algorithmic data loss (~1 Reel, 3–5 Stories, 10 comments, and a day of discovery that cannot be recovered).

### Key Questions Adaptation

- "What are the biggest barriers to follower growth?" → The account doesn't exist. This is the only barrier that matters right now.
- "Which content types are underperforming?" → There is no content. Here's what Instagram's current algorithm favors for new accounts.
- "What viral opportunities exist?" → The launch post itself is the strongest opportunity. Beyond that: these 8 repeatable viral formats.
- "How to improve engagement rate?" → Engagement must be CREATED, not improved. Here are the 4 fastest levers.

## Report HTML Structure

The standard 16-section structure adapts as follows:
1. Executive Summary (opens with non-existence finding)
2. Brand Snapshot (handle availability, not business facts)
3. Platform-by-Platform Audit (failure log — which platforms returned what)
4. Strengths & Weaknesses (handle quality + activation gaps)
5. Root Cause Analysis (all gaps trace to non-existence)
6. Peer Comparison (projected maturity stages)
7. Growth Bottlenecks (#1 = account doesn't exist)
8. Content Gaps (all formats absent, ranked by potential reach)
9. Audience Psychology (positioning options × audience segments)
10. Viral Opportunities (projected, not analyzed)
11. Engagement Growth Strategy (launch strategy, not optimization)
12. Performance Score (4/100 baseline)
13. Road to 1,000 Followers (90-day launch plan)
14. High-Impact Recommendations (tiered, launch-focused)
15. Platform-Specific Improvements (per-platform launch actions)
16. Content Ideas (10 concrete launch pieces)
17. Key Questions Answered (the 4 questions, adapted)
18. Audit Cadence (post-launch re-audit schedule)

## Pitfalls

- Do NOT frame as optimization. "Improve engagement rate" is meaningless for a non-existent account. Frame everything as creation/activation.
- Do NOT use the dormant-account protocol. A dormant account EXISTS (FxTwitter 200) and has a join date. A non-existent account has no record anywhere.
- Do NOT use the handle-collision protocol. There is no collision — the handle is clean and available.
- Do NOT recommend "change the handle." The handle IS the asset — it's clean and unclaimed.
- **Handle contains "test" or "testing":** When the handle includes these keywords, address the brand perception risk explicitly in the handle quality assessment. The word can signal either a genuine review/testing niche (positive — niche alignment) or a throwaway/experimental account (negative — credibility concern). The positioning analysis should recommend a niche that makes the "test" keyword a feature, not a liability (e.g., product testing, QA tools, software testing). Score the handle slightly lower for brand perception (6/10 instead of 7–8/10 for similarly clean handles without this keyword).
- Do NOT score above 5/100. The account doesn't exist. Be honest.
- Verify non-existence on 3+ platforms before pivoting. A single platform's non-existence could be a data gap.
- Instagram's "Page isn't available" and X's FxTwitter 404 are the two strongest non-existence signals. At least one of these must be confirmed.
- **TwStalker ghost profiles are not dormant accounts.** A bare TwStalker page with all-zero metrics, no join date, and no bio — paired with FxTwitter 404 — is a residual/ghost entry. Do not pivot to the dormant-account protocol. FxTwitter 404 is the definitive signal. Note the ghost profile in the platform audit table and recommend the user attempt to claim the handle on X; if unavailable, suggest a handle variation.
