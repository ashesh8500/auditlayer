"""Instagram Graph API client for the AuditLayer worker.

Fetches live profile, media, and (optionally) insights data for Instagram
Business/Creator accounts connected via OAuth. When no token is available or
the token is expired, callers should fall back to the free-toolset path
(web indexation + browser research + limitations flag).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import re
from typing import Any

import httpx

INSTAGRAM_GRAPH_API_BASE = "https://graph.instagram.com/v21.0"
FACEBOOK_GRAPH_API_BASE = "https://graph.facebook.com/v21.0"
INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS = 7


def should_refresh_instagram_token(
    expires_at: str, *, now: datetime | None = None
) -> bool:
    """Return true when a direct Instagram token is inside its refresh window."""
    if not expires_at:
        return False
    try:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    current = now or datetime.now(timezone.utc)
    return expiry <= current + timedelta(days=INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS)


# ── Data models ──────────────────────────────────────────────


@dataclass
class InstagramProfile:
    """Live profile-level data from the Instagram Graph API."""

    ig_user_id: int
    username: str
    name: str = ""
    biography: str = ""
    followers_count: int = 0
    follows_count: int = 0
    media_count: int = 0
    profile_picture_url: str = ""
    website: str = ""
    account_type: str = ""  # BUSINESS or CREATOR
    fetched_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class InstagramMedia:
    """Summary of a recent media post from the Instagram Graph API."""

    id: str
    media_type: str  # IMAGE, VIDEO, CAROUSEL_ALBUM
    caption: str = ""
    permalink: str = ""
    timestamp: str = ""
    like_count: int = 0
    comments_count: int = 0
    engagement_rate: float = 0.0


@dataclass
class InstagramMetrics:
    """Aggregated metrics the worker uses for report generation."""

    profile: InstagramProfile
    recent_media: list[InstagramMedia] = field(default_factory=list)
    avg_likes: float = 0.0
    avg_comments: float = 0.0
    avg_engagement_rate: float = 0.0
    posting_cadence: str = ""
    top_content_types: list[str] = field(default_factory=list)
    _raw: dict[str, Any] | None = None


@dataclass
class MediaSummary:
    """Deterministic summary of recent media for prompt construction and QA."""

    post_count: int
    avg_likes: float
    avg_comments: float
    top_posts: list[dict[str, Any]]
    format_mix: dict[str, int]
    cadence_days: float
    common_themes: list[str]


# ── API client ────────────────────────────────────────────────


class InstagramAPIClient:
    """Fetches data from the Instagram Graph API using a stored access token."""

    def __init__(self, access_token: str):
        self._token = access_token
        self._instagram_login = access_token.startswith("IGA")
        self._base_url = (
            INSTAGRAM_GRAPH_API_BASE if self._instagram_login else FACEBOOK_GRAPH_API_BASE
        )
        self._client = httpx.Client(timeout=30.0)

    def close(self) -> None:
        self._client.close()

    def refresh_long_lived_token(self) -> tuple[str, int]:
        """Refresh a direct Instagram Login token for another 60-day window."""
        if not self._instagram_login:
            raise ValueError("Only Instagram Login tokens can use the refresh endpoint")
        response = self._client.get(
            "https://graph.instagram.com/refresh_access_token",
            params={
                "grant_type": "ig_refresh_token",
                "access_token": self._token,
            },
        )
        response.raise_for_status()
        data = response.json()
        token = str(data.get("access_token") or "")
        if not token:
            raise ValueError("Instagram refresh did not return an access token")
        return token, int(data.get("expires_in") or 5_184_000)

    # ── Profile ───────────────────────────────────────────────

    def get_profile(self, ig_user_id: int) -> InstagramProfile:
        """Fetch profile data for a connected Instagram Business/Creator account."""
        fields = [
            "id",
            "username",
            "name",
            "biography",
            "followers_count",
            "follows_count",
            "media_count",
            "profile_picture_url",
            "website",
            "account_type",
        ]
        user_path = "/me" if self._instagram_login else f"/{ig_user_id}"
        data = self._get(user_path, params={"fields": ",".join(fields)})
        return InstagramProfile(
            ig_user_id=int(data["id"]),
            username=data.get("username", ""),
            name=data.get("name", ""),
            biography=data.get("biography", ""),
            followers_count=int(data.get("followers_count", 0)),
            follows_count=int(data.get("follows_count", 0)),
            media_count=int(data.get("media_count", 0)),
            profile_picture_url=data.get("profile_picture_url", ""),
            website=data.get("website", ""),
            account_type=data.get("account_type", ""),
        )

    # ── Media ─────────────────────────────────────────────────

    def get_recent_media(
        self, ig_user_id: int, limit: int = 25
    ) -> list[InstagramMedia]:
        """Fetch recent media posts with engagement counts."""
        fields = [
            "id",
            "media_type",
            "caption",
            "permalink",
            "timestamp",
            "like_count",
            "comments_count",
        ]
        data = self._get(
            "/me/media" if self._instagram_login else f"/{ig_user_id}/media",
            params={"fields": ",".join(fields), "limit": str(limit)},
        )
        media_list: list[InstagramMedia] = []
        for item in data.get("data", []):
            media_list.append(
                InstagramMedia(
                    id=item.get("id", ""),
                    media_type=item.get("media_type", "IMAGE"),
                    caption=item.get("caption", "")[:500] if item.get("caption") else "",
                    permalink=item.get("permalink", ""),
                    timestamp=item.get("timestamp", ""),
                    like_count=int(item.get("like_count", 0)),
                    comments_count=int(item.get("comments_count", 0)),
                )
            )
        return media_list

    # ── Insights (requires instagram_manage_insights — App Review needed) ─

    def get_media_insights(self, media_id: str) -> dict[str, int]:
        """Fetch insights for a single media item (requires App Review approval)."""
        metrics = ["engagement", "impressions", "reach", "saved"]
        data = self._get(
            f"/{media_id}/insights",
            params={"metric": ",".join(metrics)},
        )
        return {
            item["name"]: item["values"][0]["value"]
            for item in data.get("data", [])
        }

    # ── Aggregate ─────────────────────────────────────────────

    def get_full_metrics(self, ig_user_id: int) -> InstagramMetrics:
        """Fetch profile + recent media + compute aggregate metrics."""
        profile = self.get_profile(ig_user_id)
        media = self.get_recent_media(ig_user_id, limit=25)

        # Compute engagement per post
        for m in media:
            if profile.followers_count > 0:
                m.engagement_rate = round(
                    (m.like_count + m.comments_count)
                    / profile.followers_count
                    * 100,
                    2,
                )

        # Aggregate stats
        avg_likes = sum(m.like_count for m in media) / len(media) if media else 0
        avg_comments = (
            sum(m.comments_count for m in media) / len(media) if media else 0
        )
        avg_er = (
            sum(m.engagement_rate for m in media) / len(media) if media else 0
        )

        # Posting cadence from timestamps
        cadence = _compute_cadence(media)

        # Top content types by count
        type_counts: dict[str, int] = {}
        for m in media:
            t = m.media_type
            type_counts[t] = type_counts.get(t, 0) + 1
        top_types = sorted(type_counts, key=lambda k: type_counts.get(k, 0), reverse=True)[:3]

        return InstagramMetrics(
            profile=profile,
            recent_media=media,
            avg_likes=round(avg_likes, 1),
            avg_comments=round(avg_comments, 1),
            avg_engagement_rate=round(avg_er, 2),
            posting_cadence=cadence,
            top_content_types=top_types,
        )

    # ── Helpers ───────────────────────────────────────────────

    def _get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        p = dict(params or {})
        p["access_token"] = self._token
        resp = self._client.get(url, params=p)
        resp.raise_for_status()
        return resp.json()


# ── Utilities ─────────────────────────────────────────────────


def _compute_cadence(media: list[InstagramMedia]) -> str:
    """Rough posting cadence from timestamp spread of recent media."""
    if len(media) < 3:
        return "unknown"
    timestamps = sorted(
        [
            datetime.fromisoformat(m.timestamp.replace("Z", "+00:00"))
            for m in media
            if m.timestamp
        ],
        reverse=True,
    )
    if len(timestamps) < 3:
        return "unknown"
    window_days = max((timestamps[0] - timestamps[-1]).days, 7)
    posts_per_week = len(timestamps) / (window_days / 7)
    if posts_per_week >= 5:
        return "5-7x/week"
    elif posts_per_week >= 3:
        return "3-4x/week"
    elif posts_per_week >= 1:
        return "1-2x/week"
    return "<1x/week"


_THEME_STOPWORDS = {
    "about", "after", "again", "also", "been", "from", "have", "into",
    "more", "post", "that", "test", "this", "with", "your",
}


def summarize_media(
    media: list[InstagramMedia], *, top_n_posts: int = 5
) -> MediaSummary:
    """Summarize media without network calls or follower-count assumptions."""
    if not media:
        return MediaSummary(0, 0.0, 0.0, [], {}, 0.0, [])

    ranked = sorted(
        media,
        key=lambda item: item.like_count + item.comments_count,
        reverse=True,
    )[:top_n_posts]
    top_posts = [
        {
            "id": item.id,
            "media_type": item.media_type,
            "likes": item.like_count,
            "comments": item.comments_count,
            "permalink": item.permalink,
        }
        for item in ranked
    ]
    format_mix = dict(Counter(item.media_type for item in media))

    parsed_times = []
    for item in media:
        if not item.timestamp:
            continue
        try:
            parsed_times.append(datetime.fromisoformat(item.timestamp.replace("Z", "+00:00")))
        except ValueError:
            continue
    cadence_days = 0.0
    if len(parsed_times) >= 2:
        span_days = (max(parsed_times) - min(parsed_times)).total_seconds() / 86400
        cadence_days = round(span_days / (len(parsed_times) - 1), 1)

    words: Counter[str] = Counter()
    for item in media:
        for word in re.findall(r"[a-z][a-z-]{3,}", item.caption.lower()):
            if word not in _THEME_STOPWORDS:
                words[word] += 1
    common_themes = [
        word for word, count in words.most_common(8) if count >= 2 or len(media) == 1
    ][:5]

    return MediaSummary(
        post_count=len(media),
        avg_likes=round(sum(item.like_count for item in media) / len(media), 1),
        avg_comments=round(sum(item.comments_count for item in media) / len(media), 1),
        top_posts=top_posts,
        format_mix=format_mix,
        cadence_days=cadence_days,
        common_themes=common_themes,
    )
