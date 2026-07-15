# Micro-Account Peer Discovery (Sub-1000 Followers)

## Problem

Finding real, verifiable same-tier peers for sub-1000-follower Instagram accounts is
structurally hard. These accounts have near-zero web footprint — their handles do not
appear in search results, their content is not indexed, and third-party analytics
platforms ignore them. The standard peer-discovery approach (search "gynaecologist
Mumbai Instagram") returns only accounts with 10K+ followers who have SEO presence.

## Why This Matters

The skill mandates 3 named peers per comparison table. For a 112-follower account,
finding 3 peers at 100-500 followers in the same city and niche requires a different
strategy than finding peers for a 10K account. The agent must not burn 20 browser
calls on handle-guessing.

## Strategy: 5-Pass Discovery Protocol

### Pass 1: Web Search for Same-Niche Content (2-3 calls)

Search for the niche + platform, NOT for follower counts:
- `site:instagram.com "<city>" "<specialty>" reel 2025 2026`
- `instagram "<specialty>" "<city>" handle @dr`
- `"<city> <specialty>" instagram.com/dr`

Extract handles from reel descriptions and post metadata in the search snippets.
These rarely contain follower counts but give you candidate handles to verify.

### Pass 2: Browser Verification of Candidates (up to 5 calls)

For each candidate handle, use `browser_navigate` + `browser_console` to extract:
```
document.querySelector('meta[property="og:description"]')?.content
```

This returns the follower/post/following counts in one shot. It works behind the
login wall. A typical result: "699 Followers, 354 Following, 76 Posts..."

### Pass 3: Off-Tier Fallback (if Pass 2 yields < 2 same-tier peers)

When verified peers land at 700-2,000 followers instead of 100-500, use them anyway.
A 699-follower peer is still a same-order-of-magnitude comparison for a 112-follower
account. Document the tier difference in the comparison rationale. The skill says:
"use verified-but-off-tier accounts with the follower count stated — that's still
better than 'Peer A.'"

### Pass 4: Sibling-Niche Expansion (if still < 3 peers)

Expand the niche slightly: "Mumbai gynaecologist" → "Mumbai women's health doctor"
or "India-based obstetrician." A clinical dietician who treats PCOS patients is a
better peer than an archetype placeholder.

### Pass 5: Stop and Document (after 12+ attempts)

After 12+ research attempts (web searches + browser verifications combined), stop.
Document the effort in the report: note that sub-500-follower accounts in this niche
and geography have zero web footprint, and the verified peers represent the closest
discoverable comparables. This is a research finding in itself — it means the subject
is in an activation-tier vacuum where most peers are similarly invisible.

## Efficiency Metric: Follower-Per-Post Ratio

When you have verified follower counts AND post counts for peers, compute:
```
f/p ratio = followers ÷ posts
```

This is a diagnostic for micro accounts:
- f/p < 2.0: Posting frequently but not converting to follows (content or targeting issue)
- f/p 2.0-8.0: Normal range for micro accounts
- f/p > 8.0: Efficient — each post is converting well

Example from @dr.truptikaji audit:
- @dr.truptikaji: 112/19 = 5.9 f/p (normal)
- @drtriptidubeyyadav: 259/236 = 1.1 f/p (volume without strategy)
- @drmaitreyeeparulekar: 699/76 = 9.2 f/p (efficient, niche-differentiated)

Use this in the comparison table and prose analysis.

## Pitfall: Exa/Web Search Cannot Find Micro Accounts

Exa and Google search indices heavily favor accounts with 1K+ followers. Searches
like "Mumbai gynaecologist 100-500 followers Instagram" will return zero relevant
results because follower counts are not in search indices. Do not expect search
alone to surface same-tier peers. Browser verification of candidate handles is the
primary method.

## Pass 6: Published Nano-Influencer Indexes (June 2026)

When direct search and handle-guessing both fail, use published nano-influencer
lists from influencer marketing agencies and blogs. These are editorial roundups
that include real handles, approximate follower counts, niches, and engagement
rates — often for accounts in the 1K–10K range that would never surface in
algorithmic search results.

**Sources that worked (June 2026):**
- The Viral Union: `theviralunion.com/blog/top-nano-influencers-in-india/` — 10
  creators with handles, follower counts, engagement metrics, and niche tags
- Grynow: `grynow.in/blog/top-nano-influencers-india.html` — 10 creators with
  detailed profiles, brand collaborations listed, and location data

**How to use:**
1. `web_search` for `"nano influencer" india <niche> list 2025 2026`
2. `web_extract` the article to get handle + follower count + niche
3. Filter for same-tier accounts (within 2x–5x of subject's follower count)
4. Verify handles exist via `browser_navigate` + `browser_console` og:description
   before publishing in the report

**Why this works:** Influencer marketing agencies maintain these lists for brand
clients. The handles are real (agencies stake reputation on them), the data is
roughly current (articles are updated quarterly), and the tier coverage (1K–20K)
fills exactly the gap that web search indices miss.

**Limitations:** Follower counts are approximate and may be 3–6 months stale.
Always verify with the og:description meta tag before publishing. Some handles
may have grown beyond nano tier since the article was published — if they're now
at 15K+, they may still work as an off-tier peer (see Pass 3).

## Pitfall: Handle-Guessing Has Low Hit Rate

Guessing handles (e.g., `drpooja_nadkarni`, `dr.shweta.shah.obgyn`) has a ~30%
hit rate. After 3-4 misses, shift to extracting handles from search result snippets
rather than guessing.

## Pitfall: Freelance/B2B Service Niches — Near-Zero Handle-Guessing Hit Rate

For freelance service accounts (social media managers, content strategists, virtual assistants, freelance writers), handle-guessing hit rate drops to near zero. These accounts use highly generic naming patterns — `socialwithX`, `contentbyY`, `smmwithZ`, `digitalwithW` — with no predictable name component. Unlike doctors (`drX`), lawyers, or location-anchored professionals, freelance SMM handles follow no profession→handle mapping convention.

**Additional failure modes specific to this niche:**
- Published nano-influencer indexes (Pass 6) cover lifestyle, beauty, travel, food — not B2B/freelance service accounts. Searching for "nano influencer social media manager" returns aspirational content aimed AT SMMs, not lists OF SMMs.
- Search engines conflate "social media manager" (a person) with "social media management" (a service/job category). Every query returns hiring guides, job boards, and how-to articles — not actual Instagram handles.
- The SMM community tends to use DM-based networking rather than public indexation, so even engaged accounts are invisible to search.

**What works instead:**
1. **Owner's secondary accounts** — many SMM freelancers run a second IG account (UGC, personal, niche blog). These are discoverable via bio links ("@ugcshaimah" in @shaimastrategist's bio). They serve as valid internal benchmarks — same owner, different content strategy, comparable tier.
2. **Comment-section mining** — extract handles from the subject's own post comments. These are real accounts at comparable tiers, even if they're too small to verify as formal peers.
3. **Accept the structural finding** — after 12+ attempts with zero same-tier verified peers, document the research gap as a report finding. The sub-1K SMM strategist space is an activation-tier vacuum. Frame the section as "Peer Comparison" with one verified account + industry benchmarks, and note the discovery difficulty in the callout. This is honest and diagnostically useful — it tells the client they're in an invisible tier where becoming visible is the opportunity.
