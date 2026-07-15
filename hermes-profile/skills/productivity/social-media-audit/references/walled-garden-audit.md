# Walled-Garden Audit Protocol — Instagram-Primary, Zero Web Indexation

When an account exists on Instagram as its primary platform but is structurally inaccessible to all research methods, and has zero web indexation. This is distinct from test/spoof accounts (handle contains obvious patterns), nonexistent accounts (Instagram says "Page isn't available"), and handle-collision accounts (handle is a technical term flooded by non-social content).

## Pre-Check: Social Blade Before Full Wall Declaration

Before invoking this protocol, run ONE Social Blade check:

```
web_search("socialblade instagram <handle>")
```

- **If Social Blade has the account** (result includes `socialblade.com/instagram/user/<handle>`) → the account is 2K+ followers and WAS indexed pre-wall. You have full metrics. Do NOT use the walled-garden protocol — use Social Blade as your primary Instagram data source. See `references/instagram-data-sourcing.md` for the account size tiers.
- **If Social Blade has no record** (unrelated results or no match) → account is below ~2K followers. Proceed with this walled-garden protocol. Partial data is available from Google snippets (bio, follower/post counts); strategic analysis is still viable.

This one call prevents the #1 mistake: declaring a walled-garden situation for a 10K+ account when Social Blade data is sitting there.

## Detection Signature (May 2026)

| Method | Expected | Actual |
|--------|----------|--------|
| Instagram direct (browser_navigate) | Profile page | Login-wall redirect (/accounts/login/) |
| Instagram direct (curl) | Profile HTML + meta tags | Login-wall redirect |
| Instagram GraphQL (query_hash variants) | JSON profile data | "invalid request" / "Incorrect Query" |
| i.instagram.com API (mobile UA) | JSON profile data | "Page Not Found" or empty |
| Third-party viewers (Picuki, Dumpor, Imginn, Greatfon) | Profile stats | Cloudflare captcha / "Just a moment..." |
| Bibliogram instances | Profile page | Redirecting... / empty |
| Instasave / other scrapers | Profile data | Empty response |
| Social Blade | Stats table | Cloudflare "Access denied" (Error 1020) |
| Web search (Google, Bing, Brave, DDG, Startpage, SearX) | Social media results for handle | Zero results — all dictionary/technical content |
| Reddit search | Community discussion | Blocked ("whoa there, pardner!") |
| TikTok @handle | Profile page | "Couldn't find this account" |
| YouTube @handle | Channel page | 404 |
| LinkedIn company page | Company profile | 404 or redirect |
| Threads @handle | Profile page | Login redirect |
| X/Twitter @handle (curl + FxTwitter) | Profile data | JS-only page / empty |
| Link-in-bio tools (Linktree, Beacons, bio.link) | Landing page | 404 |
| URLScan / web archives | Historical page data | No records |

**Decisive threshold:** 12+ methods return zero data. This is not a "keep trying" situation — the account is structurally invisible to automated research.

## Pivot Strategy

The audit must be produced from industry benchmarks, strategic frameworks, and competitive pattern analysis. Do NOT fabricate metrics.

1. **Executive Summary:** Open with a clear statement of data limitations. "This account could not be accessed through any of [N] research methods. Instagram now login-gates all profile views, and the account has zero web indexation. The analysis below uses industry benchmarks for accounts in comparable niches and size tiers."

2. **Brand Snapshot:** Build from what IS known — handle consistency, platform presence (which platforms confirmed yes vs no), inferred niche from handle semantics. Mark all unknown metrics as "Unknown (estimated <X)" with conservative estimates.

3. **Platform-by-Platform Audit:** Document per-platform status as actual findings. "Instagram: account exists but not publicly accessible." "TikTok: platform confirms no account exists." This IS data.

4. **Strengths:** Focus on structural advantages the handle/naming has regardless of metrics — handle memorability, niche adjacency, content premise (the handle name IS a content engine).

5. **Weaknesses:** The research failure log IS the weaknesses section. Every blocked attempt is a weakness. Prioritize: no web indexation, no cross-platform presence, no link-in-bio, no verified badge.

6. **Root Cause Analysis:** Distribution architecture failure, not content quality. Explain the vicious cycle: no discoverability → no engagement → no algorithmic promotion → continued invisibility.

7. **Peer Comparison:** Use structurally similar accounts in adjacent niches where public data IS available. Note follower ranges (~ notation), content styles, cross-platform status.

8. **Growth Bottlenecks:** Rank by severity. The top bottleneck is always "zero external discovery channels" because every growth path flows through Instagram's internal algorithm alone.

9. **Content Gaps:** Assess by format type (Reels, carousels, Stories, UGC, Lives, etc.) using industry-standard "accounts in this niche typically have/miss X" framing.

10. **Audience Psychology:** Infer from handle semantics and niche adjacency. What does "verify working" promise? What anxiety/need does it address?

11. **Viral Opportunities:** Propose content formats with high structural virality in the inferred niche — "Does It Work?" series, salary verification, fake job exposure.

12. **Engagement Growth Strategy:** Platform-agnostic best practices by format type. Reels cadence, carousel structure, Story interactives, community loops.

13. **Performance Score:** Score low honestly (15-25/100 for walled-garden accounts). The score reflects structural readiness, not content quality. Weight the "Cross-Platform Presence" and "Web Discoverability" dimensions aggressively — they're where the points are lost.

14. **Recommendations:** Tier 1 = distribution infrastructure (make profile public, get Meta Verified, create Linktree, register handles elsewhere). Tier 2 = activate discovery (Reels-first strategy, simple website, bio SEO). Tier 3 = build moats (newsletter, media pitches, partnerships, paid product).

15. **Content Ideas:** 10 specific content pieces likely to increase reach, with format, rationale, and estimated reach multiplier. All based on competitive pattern analysis and niche best practices.

## Report Styling

- Include a prominent "Research Limitations" or "Data Notice" callout at the top (yellow-bordered box with warning styling)
- Use `~` notation for all estimated numbers
- Every table that contains estimates should have a footnote: "Metrics estimated using industry benchmarks for accounts in this size tier"
- The Research Verification Log (12+ methods attempted, 0 data) should be visible — it IS a finding

## When This Applies

This protocol applies when ALL of:
- Instagram is the primary platform
- Instagram login-wall blocks profile access
- 8+ alternative research methods return zero usable data
- Handle does not match test/spoof patterns
- Handle does not match technical-term collision patterns
- No evidence the account doesn't exist (it likely does — just inaccessible)

## When This Does NOT Apply

- Instagram returns "Page isn't available" (use `references/nonexistent-account-audit.md`)
- Handle contains "test" + numeric suffix (use `references/test-spoof-account-pattern.md`)
- Handle is a technical term flooded by non-social results (use `references/handle-collision-discovery.md`)
- **Social Blade has the account indexed** — run the pre-check above first. A 10K+ account with Social Blade data is NOT a walled-garden situation. Use Social Blade for metrics.
- Account has bio links, a website, or cross-platform content that IS accessible (use those as primary data sources)
