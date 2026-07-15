# Live Instagram Metrics via Meta Tags

When Social Blade data is stale, get current follower/post counts directly from Instagram's public meta tags.

## Command

```bash
curl -s "https://www.instagram.com/<handle>/" -H "User-Agent: Mozilla/5.0" | grep 'og:description'
```

## What you get

```
<meta property="og:description" content="3,715 Followers, 3 Following, 188 Posts - ..." />
```

Extracts:
- **Followers** (rounded to nearest K above 1K)
- **Following** count
- **Posts** (media count)
- **Bio** text

## When to use

⚠️ **Degradation notice (May 2026):** This technique now fails for ~70% of accounts — Instagram serves JS-rendered pages with empty `og:description` meta tags. Try it as a first attempt, but expect it to return nothing. See `references/instagram-data-sourcing.md` for the full fallback strategy (cross-platform identity research via LinkedIn, company websites, Pinterest, third-party analytics).

- Social Blade hasn't updated in >7 days
- The user reports follower changes since last audit
- Quick verification after audit refresh (but only if meta tags are still served for this account)

## Limitations

- Follower count rounds above 10K (e.g., "11K" = 10,950–11,049)
- No engagement rate, growth rate, or historical data
- Bio text truncated in meta tag

## Combine with Social Blade

Social Blade → engagement rate, 14-day growth charts. IG meta tags → live snapshot. Together: current enough for a refresh without accessing the Professional Dashboard.
