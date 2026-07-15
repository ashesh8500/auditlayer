# TikTok Data Sourcing — Failover Chain

## Primary method: Browser profile scrape (most reliable)

Navigate to `https://www.tiktok.com/@<handle>` and extract stats from the page snapshot or console. TikTok's profile page renders follower count, following count, likes (hearts received), video count, and bio text without requiring authentication.

Key data points visible without login:
- Display name, handle, bio, verified status
- Follower count, following count, likes (total hearts received by the creator)
- Video count (from the tab header)
- Video previews (titles, view counts for first few videos)

**NOTE:** TikTok's "Likes" number on the profile page = total hearts the creator HAS RECEIVED, not hearts they've given. This is different from Instagram where "Likes" sometimes refers to posts the user has liked. The TikTok API field name `heartCount` is unambiguous.

## Fallback: HTML scrape via execute_code

When browser snapshot is truncated or API endpoints reject, use execute_code with urllib to scrape the raw HTML. This is the most reliable programmatic method as of May 2026.

```python
import urllib.request
import re

req = urllib.request.Request(
    'https://www.tiktok.com/@<handle>?lang=en',
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
)
with urllib.request.urlopen(req, timeout=15) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

# Extract user stats with regex
follower_matches = re.findall(r'followerCount[\":\s]+\d+', html)
video_matches = re.findall(r'videoCount[\":\s]+\d+', html)
heart_matches = re.findall(r'heartCount[\":\s]+\d+', html)
digg_matches = re.findall(r'diggCount[\":\s]+\d+', html)
following_matches = re.findall(r'followingCount[\":\s]+\d+', html)
private_matches = re.findall(r'privateAccount[\":\s]+(true|false)', html)
bio_matches = re.findall(r'\"signature\"\s*:\s*\"[^\"]*\"', html)
name_matches = re.findall(r'\"nickname\"\s*:\s*\"[^\"]+\"', html)
secuid_matches = re.findall(r'secUid[\":\s]+\"[^\"]+\"', html)
```

The HTML typically contains a `__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag with full user data, but it's large. Regex extraction is faster and more reliable for specific fields.

Stats object pattern in HTML:
```json
"stats":{"followerCount":38000,"followingCount":15,"heart":324,"heartCount":324,"videoCount":3,"diggCount":0,"friendCount":5}
```

Fields explained:
- `followerCount`: total followers
- `followingCount`: accounts followed
- `heartCount` / `heart`: total hearts (likes) the creator has received across all videos
- `videoCount`: total public videos
- `diggCount`: total likes the creator has GIVEN to other videos (0 = they don't actively like content)
- `friendCount`: mutual follows

## API method (unreliable — often returns empty)

The public API endpoint `https://www.tiktok.com/api/user/detail/?uniqueId=<handle>` frequently returns empty responses without proper authentication/cookies. Do not rely on this as the primary method. If it works, it provides clean JSON; if it returns empty, fall through to HTML scrape immediately.

## Video-level data

The video list API (`/api/post/item_list/`) also frequently returns empty. For video-level stats (play count, likes per video, comments, shares, saves), use:

1. Browser snapshot — scroll the profile, each video card shows view count
2. Browser console: `document.querySelectorAll('[data-e2e="user-post-item"]').length` — 0 means no visible videos (content may be private or account has no posts)

## Pitfalls

- **TikTok profile shows "Suggested accounts" section instead of videos** when the user has zero public videos or all content is private. The browser snapshot will show a "Suggested accounts" heading and celebrity follow suggestions rather than a content grid. This is diagnostic — the account has no public content.
- **"324 Likes" on the profile page = hearts received by the creator**, not hearts the creator has given to other videos. The API `diggCount` field tracks hearts given by the creator (often 0 for low-activity accounts).
- **TikTok API returns empty when called without proper Referer headers.** Always set `Referer: https://www.tiktok.com/` in API requests.
- **Account may be region-locked.** TikTok serves different content to different regions. The `region` field in `__UNIVERSAL_DATA_FOR_REHYDRATION__` shows which region the request was served from (e.g., "DE" = Germany). This does not indicate the creator's location — it's the viewer's detected region.
- **TikTok page loads JS-rendered content.** The initial HTML contains all profile stats in script tags — no need to wait for JS execution. Direct HTML scrape is faster than browser navigation for numeric data.
