# Instagram Data Sourcing

When Social Blade or third-party tools return stale data (common — often 7–14 days behind), use Instagram's public HTML meta tags to get current account metrics.

## Current Follower / Following / Post Count

```bash
curl -s "https://www.instagram.com/{username}/" \
  -H "User-Agent: Mozilla/5.0" \
  | grep 'og:description'
```

Returns something like:
```html
<meta content="11K Followers, 46 Following, 173 Posts - See Instagram photos..." name="description" />
```

**Rounding behavior:** Instagram rounds follower counts above 10K to the nearest thousand (e.g., "11K" = 10,950–11,049). Use `~` notation in reports to acknowledge this imprecision.

**Following count:** Exact, not rounded. A change from 45→46 is meaningful.

**Post count:** Exact, not rounded. Track this to infer posting cadence between refreshes.

## Primary Method: Instagram Web Profile Info API (i.instagram.com)

**This is the single most reliable method for live Instagram data as of June 2026.** The `i.instagram.com/api/v1/users/web_profile_info/` endpoint returns structured JSON with follower count, following count, total post count, bio, full name, account type (business/personal), verification status, Linktree/external URL, highlight count, and — critically — up to 12 recent posts with like counts, comment counts, captions, timestamps, and content type (GraphVideo/GraphSidecar/GraphImage). It works without authentication for public accounts of all sizes.

```bash
curl -sL --max-time 15 \
  "https://i.instagram.com/api/v1/users/web_profile_info/?username=<handle>" \
  -H "User-Agent: Instagram 219.0.0.12.117 Android"
```

**Returns (JSON):**
```json
{
  "data": {
    "user": {
      "username": "...",
      "full_name": "...",
      "biography": "...",
      "edge_followed_by": {"count": 17363},
      "edge_follow": {"count": 224},
      "is_business_account": true,
      "is_professional_account": true,
      "is_verified": false,
      "external_url": "https://linktr.ee/...",
      "highlight_reel_count": 2,
      "has_clips": true,
      "edge_owner_to_timeline_media": {
        "count": 70,
        "edges": [
          {
            "node": {
              "shortcode": "DZ5rCPAhM3b",
              "__typename": "GraphVideo",
              "edge_liked_by": {"count": 20},
              "edge_media_to_comment": {"count": 5},
              "edge_media_to_caption": {"edges": [{"node": {"text": "..."}}]},
              "taken_at_timestamp": 1782159332
            }
          }
          // up to 12 recent posts
        ]
      }
    }
  }
}
```

**What you get from one API call:**
- Exact follower/following/post counts (not rounded)
- Bio text and external URL
- Account type (business vs personal)
- Verification status
- 8–12 recent posts with: shortcode (post ID), content type (Reel/Carousel/Image), like count, comment count, full caption text, and timestamp
- Enough data to calculate: engagement rate, posting cadence, content format mix, best/worst performing posts, caption patterns

**Key fields for audit reports:**
| JSON Path | What It Is | Audit Use |
|---|---|---|
| `edge_followed_by.count` | Exact follower count | Key Metrics |
| `edge_follow.count` | Exact following count | Following ratio check |
| `edge_owner_to_timeline_media.count` | Total posts | Portfolio depth |
| `edges[*].node.edge_liked_by.count` | Likes per post | Engagement calculation |
| `edges[*].node.edge_media_to_comment.count` | Comments per post | Engagement depth |
| `edges[*].node.__typename` | GraphVideo / GraphSidecar / GraphImage | Content format mix |
| `edges[*].node.edge_media_to_caption.edges[0].node.text` | Full caption | Voice/tone analysis |
| `edges[*].node.taken_at_timestamp` | Unix timestamp | Posting cadence |
| `is_business_account` | Boolean | Account type detection |
| `is_verified` | Boolean | Credibility check |

**Rate limiting:** The endpoint tolerates batch queries for peer discovery. In practice (June 2026), 25+ sequential calls in rapid succession from the same IP triggered no blocks. If the endpoint starts returning empty or error responses, add a 2-second delay between calls.

**What this method does NOT provide:**
- Story metrics (reach, replies, taps) — requires authenticated Professional Dashboard
- Reels play counts — not exposed in this API response
- Profile visit counts — requires authenticated Insights
- Audience demographics (age, gender, location) — requires authenticated Insights
- Post-level reach/impressions — not exposed

**Comparison to other methods:**
| Method | Works? | What You Get | |
|--------|--------|-------------|---|
| i.instagram.com API | ✅ Yes (June 2026) | Followers, posts, bio, 12 recent posts with engagement | **USE THIS FIRST** |
| Instagram profile page (curl/browser) | ❌ Login-wall redirect | Nothing | Dead |
| og:description meta tag | ❌ 0% reliable | Nothing | Dead |
| ?__a=1 GraphQL | ❌ Deprecated | Nothing | Dead |
| Third-party viewers (Picuki, Dumpor, etc.) | ❌ Cloudflare-blocked | Nothing | Dead |
| Social Blade | ⚠️ 2K+ accounts only | Stale metrics (7-14 day lag) | Fallback |
| Individual post URLs (browser) | ✅ Partial | Captions, comments, More Posts carousel | Content-only fallback |

**Priority:** Always query this endpoint FIRST before attempting any other Instagram data sourcing method. One call yields more audit-useful data than all other methods combined. If the endpoint returns a valid response (HTTP 200 with `data.user.username` matching the handle), you have everything needed for a metric-driven audit. If it returns empty/error, fall through to cross-platform research or walled-garden protocol.

## Instagram Login-Wall Redirection (May 2026 — Definitive)

As of May 2026, Instagram redirects **ALL** unauthenticated profile page views to `/accounts/login/?next=...`. This is not a JS-rendering issue — the server returns a 302 redirect before any profile HTML is served. The `og:description` meta tag scraping technique is **0% reliable**. The profile page and `?__a=1&__d=1` endpoints are fully deprecated.

**Important:** The profile page login-wall does NOT affect the `i.instagram.com/api/v1/users/web_profile_info/` endpoint documented above. That API endpoint continues to serve profile data without authentication. Use it as the primary method.

**Symptoms of login-wall (profile page only):**
- `curl https://www.instagram.com/<handle>/` returns the login page, not the profile page
- `browser_navigate` to any Instagram profile lands on `/accounts/login/`
- The page has exactly 4 DOM elements: Instagram logo, Log In link, Sign Up button, and a parent container
- There is NO profile HTML, NO meta tags, NO og:description, NO structured data of any kind

**Rapid detection via browser (profile page):**
```
browser_navigate("https://www.instagram.com/<handle>/")
# If the URL bar shows /accounts/login/ — login-wall. Profile page data is inaccessible.
# Use the i.instagram.com API endpoint instead.
```

**What this means for profile-page scraping:** Instagram profile page HTML is completely inaccessible without an authenticated session. Profile-page scraping methods are dead. Always use the i.instagram.com API endpoint as the primary data source.

## Fallback: Cross-Platform Identity Research

When Instagram data is inaccessible, build a composite profile from other platforms:

1. **LinkedIn** — search for the person's name + company/role. LinkedIn profiles are publicly indexed and return follower counts, connections, location, and role.
2. **Company website** — if the subject works at a known company, the company's team/about page often lists employees with photos and roles.
3. **Pinterest** — often indexed under real names. Search `<name> pinterest` to find boards and activity.
4. **Google site:instagram.com searches** — `site:instagram.com "<handle>"` may surface individual post pages that contain partial meta data even when the profile page doesn't.
5. **Third-party analytics** — NinjaOutreach, Qoruz, Viralist, HypeAuditor sometimes have cached follower counts for small accounts. Unreliable but worth a quick check.
6. **Threads** — if the Instagram handle is also a Threads handle (same username), Threads pages often serve cleaner meta tags than Instagram.

**How to present sparse data:** Be transparent. Add a `Data Notice` callout at the top of the report explaining what is estimated vs verified. Use `~` notation for all estimated numbers. Frame the data gap as a finding itself — "this account lacks public discoverability signals" is meaningful diagnostic information.

## Limitations

- **No engagement rate** — Instagram meta tags don't expose likes, comments, or ER. Use Social Blade's last-known ER and note it may be stale.
- **No growth rate** — estimate from the delta between Social Blade's last data point and the current count.
- **No content-level data** — can't see individual post performance, Stories activity, or Reel views.
- **Meta tag degradation:** The `curl | grep 'og:description'` technique documented above now fails for ~70% of accounts. See "Meta Tag Degradation" section above for fallback strategies.
- **Login-gated pages:** The `?__a=1&__d=1` query parameter (old JSON API) is deprecated and returns login walls.

## DuckDuckGo Lite — Profile Data via Search Index (June 2026)

When Instagram itself login-walls all profile views, DuckDuckGo Lite (`lite.duckduckgo.com`) often still returns the profile's og:description from its search index — including follower count, following count, post count, and full bio text. DDG's index was built before the wall went up and retains cached metadata that Instagram no longer serves to unauthenticated requests.

**How to use:**
```bash
curl -sL "https://lite.duckduckgo.com/lite/?q=%22{handle}%22+instagram" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
```

Parse the HTML response for Instagram result blocks. A single query typically returns:
- Follower/post/following counts (from the indexed og:description)
- Full bio text
- 3–6 individual post snippets with engagement data (likes, comments, dates, captions)
- Individual post/reel URLs that can be curled for deeper metadata

**Rate-limit pitfall:** DDG Lite rate-limits aggressively after ~3–4 queries from the same IP. After that, every query returns a CAPTCHA challenge ("Select all squares containing a duck"). Do NOT burn queries on broad searches — aim the first 2–3 queries at the highest-value targets (profile page, site:instagram.com handle search, niche peer discovery) and extract everything you can from each response before moving on.

**This is often the ONLY source of verified metrics for accounts under ~5K followers** when Social Blade doesn't index them, Instagram login-walls, and web_search/web_extract are unavailable.

## Total Research Blockade

When ALL sources fail simultaneously — Instagram login-wall redirects, Social Blade Cloudflare-blocked, all third-party viewers blocked (Picuki, Dumpor, Imginn, Greatfon, Bibliogram), search engines returning captchas/bot-detection/credit-exhaustion, cross-platform presence minimal or absent — the research failure IS the finding. Document the full attempt log in a "Research Verification Log" table (method, expected result, actual result, diagnosis) rather than leaving metrics blank. A 12-method, 0-data-point log is stronger diagnostic evidence than sparse estimates.

**Two distinct failure modes:**

1. **Test/spoof account pattern:** Handle contains "test" or "spoof" + numeric suffix (e.g., `tier_spoof_test_1779241145`). See `references/test-spoof-account-pattern.md`.

2. **Walled-garden account pattern (May 2026):** The account is a genuine Instagram-first presence with zero web indexation. The handle does NOT contain obvious test/spoof signals. Instagram login-wall blocks all profile data. Cross-platform presence is minimal (handle may exist on X but dormant, absent from TikTok/YouTube/LinkedIn). No bio links (no Linktree, Beacons, custom domain). Web search returns zero indexed results for the specific handle. This is the most common pattern for small/niche Instagram-only accounts as of mid-2026. See `references/walled-garden-audit.md` for the full protocol.

**Decision threshold:** After 8 distinct research methods return zero usable data points AND the handle does not match test/spoof patterns, stop cycling through alternative sources. Pivot to best-effort audit: produce a structurally complete report using industry benchmarks, strategic frameworks, and competitive pattern analysis. State data limitations prominently in a Data Notice section. Score conservatively — default to the low end of the benchmark range for the estimated account size tier.

## Account Size Tiers & Data Availability (May 2026)

Since Instagram login-walls ALL unauthenticated profile views, data quality now depends entirely on whether third-party trackers indexed the account before the wall went up. Social Blade is the primary fallback — but it only tracks accounts above a size threshold.

| Tier | Follower Range | Social Blade Data | What You Can Get | Audit Quality |
|------|---------------|-------------------|------------------|---------------|
| **Full Metrics** | 2,000+ | ✅ Indexed pre-wall | Followers, following, posts, engagement rate, avg likes/comments, 14-day growth, posting cadence | Full quantitative audit |
| **Partial Data** | 500–2,000 | ❌ Not indexed | Bio, follower/post counts from Google snippets, content themes from web-indexed Reels/posts, cross-platform presence | Strategy-heavy audit with estimated metrics |
| **Sparse Data** | Under 500 | ❌ Not indexed | Bio only, minimal web-indexed content, cross-platform presence (often none) | Positioning/competitive analysis, industry benchmarks |

**Key insight:** The 2K threshold is the hard cutoff for a "full metrics" audit. Below 2K, the audit shifts from metric-driven to strategy-driven — still valuable, just framed around positioning, gaps, and benchmarks rather than verified engagement numbers. Be transparent with clients about which tier their account falls into.

**Social Blade pre-check (before declaring a walled-garden situation):**
```
web_search("socialblade instagram <handle>")
# If results include "socialblade.com/instagram/user/<handle>" → account IS indexed → full metrics available
# If results are unrelated accounts or no match → account is NOT indexed → partial/sparse tier
```
This check takes one call and determines whether the account qualifies for the walled-garden protocol (zero data) or just needs the Social Blade fallback. Accounts at 10K+ are virtually guaranteed to be indexed; accounts under 1K are virtually guaranteed NOT to be.

## Individual Post URL Navigation — Rich Content Data (June 2026)

While Instagram profile pages are fully login-walled (no profile HTML served), individual
post pages (`instagram.com/p/{id}/` and `instagram.com/reel/{id}/`) are partially
accessible in unauthenticated browser sessions. They yield significantly more data
than profile pages for content strategy analysis.

**What individual post pages expose (behind the login modal):**

- **Full caption text** — the complete post caption including line breaks, mentions,
  and emoji. This appears in the accessibility tree even with the login modal present.
- **All visible comments** — commenter handles, profile picture URLs, comment text,
  timestamps (relative: "4w", "2w"), and like counts. The "Load more comments" button
  is visible but may not function without auth.
- **"More posts from [user]" carousel** — a horizontal scroll showing 6–12 recent
  posts with their thumbnail images, format badges (Clip, Carousel), and full captions
  in alt text. This gives an instant content audit without needing to visit the
  profile page.
- **Collaboration tags** — if the post is a collab, both handles are shown with
  profile picture URLs.
- **Audio track** — for Reels, the music track and artist are shown (e.g.,
  "Drake • Passionfruit").
- **Post date** — shown as a relative timestamp ("May 23", "4w").
- **Engagement buttons** — Like, Comment, Share, Save counts are visible (though may
  show partial counts for unauthenticated views).

**How to access:**
```
browser_navigate("https://www.instagram.com/reel/{shortcode}/")
# Or for static posts:
browser_navigate("https://www.instagram.com/p/{shortcode}/")
```

The login modal appears but sits on top — the post content renders underneath and
is fully visible in the browser snapshot. No auth required.

**How to find post URLs without profile access:**
1. `web_search` for `site:instagram.com "<handle>"` — returns individual post/reel
   URLs that Google has indexed
2. Once you have one post URL and navigate to it, the "More posts from [user]"
   carousel gives you 6–12 more post URLs from the subject
3. For the subject's recent content: navigate to 2–3 of their posts and extract the
   "More posts" carousel from each — this covers 15–25 recent posts across different
   content types

**Limitation — brand-owned posts invisible to keyword search:** Web search is
unreliable for finding brand-owned posts by topic or format (e.g., searching for
"fashionnova carousel new collection" or "beauty brand slide 1 title card").
Instagram's search index heavily favors influencer/UGC content that tags the brand
over the brand's own posts. You cannot search for "a carousel where slide 1 is a
logo" and get useful results — web search keywords don't index carousel slide
content. To find specific post patterns (weak slide 1s, ghosted comments), you
need to either: (a) navigate to a known brand's posts one at a time via
`browser_navigate`, or (b) have the user find them on the Instagram app where
they're logged in. Do not burn 10+ web search calls trying to keyword-search for
specific brand post content — the index doesn't have it.

**What this enables:**
- Content mix analysis (Reels vs. Carousels vs. static posts ratio)
- Posting cadence estimation (from timestamps on the ~20 most recent posts)
- Voice and tone analysis (from full captions)
- Community quality assessment (from comment authenticity, reply patterns)
- Brand collaboration detection (from @mentions in captions)
- Content theme identification (from the caption keywords and alt text)

**Limitations:**
- Like counts on unauthenticated views may show "1 like" or low numbers that don't
  reflect actual engagement — use Social Blade or benchmarks instead
- Comment threads are truncated — you see top-level comments but not deep replies
- Story content is not accessible via this method
- The login modal covers part of the page but doesn't block the accessibility tree

**Prioritization:** Individual post URLs are the single most productive research
method for Instagram accounts behind the login wall as of June 2026. One post URL
yields more useful audit data than five profile-page attempts. Always prefer this
method over profile-page scraping when the login wall is active.

| Source | Best For | Staleness | Auth Required |
|--------|----------|-----------|---------------|
| Instagram meta tags (og:description) | DEAD — login-wall redirects all unauthenticated views | N/A | N/A |
| Social Blade | Historical growth, engagement rate, 14-day charts — **works for 2K+ accounts only** | 7–14 days | No (basic) — but Cloudflare often blocks headless browsers |
| Instagram Professional Dashboard | Exact ER, saves, shares, reach, top posts | Real-time | Yes (account owner) |
| Third-party tools (Viralist, Greatfon, Dumpor, Picuki, Imginn) | ALL Cloudflare-blocked or login-gated as of May 2026 | N/A | N/A |
| Cross-platform identity research | Composite profile from LinkedIn, X, TikTok, Threads, company sites | Varies | Sometimes |
