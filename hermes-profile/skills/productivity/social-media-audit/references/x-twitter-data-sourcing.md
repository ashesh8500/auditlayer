# X/Twitter Data Sourcing — Programmatic Techniques

## FxTwitter API (primary method)

The most reliable programmatic way to get X/Twitter profile data when the platform's JS-rendered pages are inaccessible:

```
curl -sL "https://api.fxtwitter.com/<handle>" -H "User-Agent: Mozilla/5.0"
```

Returns structured JSON:
```json
{
  "code": 200,
  "message": "OK",
  "user": {
    "screen_name": "RateTest",
    "url": "https://x.com/RateTest",
    "id": "551079038",
    "followers": 0,
    "following": 1,
    "likes": 0,
    "media_count": 0,
    "tweets": 0,
    "name": "Test Account",
    "description": "",
    "raw_description": {"text": "", "facets": []},
    "location": "",
    "banner_url": "",
    "avatar_url": "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png",
    "joined": "Wed Apr 11 15:28:48 +0000 2012",
    "protected": false,
    "website": null,
    "verification": {"verified": false, "verified_at": null, "type": null}
  }
}
```

Key fields: `screen_name`, `followers`, `following`, `tweets`, `likes`, `media_count`, `name`, `description`, `location`, `joined`, `protected`, `avatar_url`, `banner_url`, `website`, `verification.verified`.

## Failover chain

When researching an X/Twitter account, try these in order:

1. **FxTwitter API** — `curl -sL "https://api.fxtwitter.com/<handle>"` (highest reliability, returns structured data even for dormant accounts)
2. **Twitter syndication API** — `curl -sL "https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=<handle>"` (returns empty `{}` for obscure/dormant accounts — NOT a "doesn't exist" signal)
3. **web_extract on x.com** — `web_extract(urls=["https://x.com/<handle>"])` (JS-rendered, often returns "Content was inaccessible or not found" even for existing accounts)
4. **Nitter frontends** — `curl -s "https://nitter.net/<handle>"` or `curl -s "https://nitter.privacydev.net/<handle>"` (unreliable: as of May 2026, nitter.net returns empty for dormant/obscure handles; privacydev.net also empty; expect 0 results for low-activity accounts)
5. **x_search** — the built-in tool (requires xAI credentials with sufficient credits; can be unavailable even when credentials exist)
6. **Social Blade** — `socialblade.com/twitter/user/<handle>` (only tracks accounts that have been queried before)
7. **TwStalker** — `https://twstalker.com/<handle>` (last-resort X discovery via browser_navigate; can surface accounts invisible to every other method including FxTwitter)

## X frontend false-negative on dormant/restricted accounts

X's own JS-rendered frontend (`x.com/<handle>`) may show "This account doesn't exist" for accounts that DO exist in X's backend. This has been observed for dormant placeholder accounts (0 tweets, 0 followers) and likely-shadow-restricted accounts. When the X frontend says "doesn't exist" but TwStalker or FxTwitter returns profile data, trust the API/scraper data — the X frontend false-negative is a strong signal of shadow-restriction or dormant-account deactivation, not actual non-existence.

## FxTwitter response codes — definitive signals

| Response | Meaning | Action |
|----------|---------|--------|
| `code: 200` with full `user` object | Account exists. All user fields populated. | Use the data. |
| `code: 200` with `user.followers: 0, user.tweets: 0` | Account exists but is dormant/never-used. Often labeled "Test Account." | Treat as dormant account (see handle-collision-discovery for pivot). |
| `code: 404, message: "User not found"` | Handle has NEVER existed on X or has been permanently removed. This is the strongest possible "does not exist" signal — stronger than syndication empty or Social Blade no-record. | This is definitive. Do not retry other methods for this handle. Pivot immediately to the invisible-account protocol. |

The 404 from FxTwitter is the most reliable non-existence signal available. When you get it, you are done researching that handle — move to the pivot strategy. Contrast with dormant accounts, which return 200 with zero metrics but still exist as records in X's database.

## Variant-handle confirmation

When the bare handle returns 404, check the handle with a trailing underscore (`handle_`) via FxTwitter. If `handle_` returns 200 (even if dormant with 4 followers and 10 tweets from 2011), this confirms the platform has reserved or never released the bare handle — it was not simply never registered. This is useful forensic context for the audit's Root Cause Analysis section.

Example from @test case (May 2026):
- `curl -sL "https://api.fxtwitter.com/test"` → 404 "User not found"
- `curl -sL "https://api.fxtwitter.com/test_"` → 200, screen_name=test_, followers=4, tweets=10, joined 2011
- `curl -sL "https://api.fxtwitter.com/testofficial"` → 404 "User not found"

The pattern confirms @test was never available — not just unclaimed.

## Critical distinction

The Twitter syndication API returning empty `{}` does **not** mean the account doesn't exist. Account @RateTest returned `{}` from syndication but returned full data from FxTwitter. The syndication API appears to only return data for accounts with some level of activity or follower count — it's unreliable for dormant, protected, or very small accounts.

A syndication API that returns completely empty output (no JSON, no `{}`, literally nothing on stdout) is also ambiguous — it can mean either "no data" or "account doesn't exist." Do not interpret empty stdout as definitive non-existence; always confirm with FxTwitter.

## x_search crediting

The x_search tool may fail with credit-exhaustion errors even when the user has xAI credentials configured. When this happens:
- Do not retry x_search — move immediately to the FxTwitter API
- The failure is a billing/credits issue, not a technical issue with the tool
