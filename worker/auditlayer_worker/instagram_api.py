"""Instagram Graph API client for the AuditLayer worker.

Fetches live profile, media, and (optionally) insights data for Instagram
Business/Creator accounts connected via OAuth. When no token is available or
the token is expired, callers should fall back to the free-toolset path
(web indexation + browser research + limitations flag).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import time
from typing import Any

import httpx

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


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


# ── API client ────────────────────────────────────────────────


class InstagramAPIClient:
    """Fetches data from the Instagram Graph API using a stored access token."""

    def __init__(self, access_token: str):
        self._token = access_token
        self._client = httpx.Client(timeout=30.0)

    def close(self) -> None:
        self._client.close()

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
        data = self._get(f"/{ig_user_id}", params={"fields": ",".join(fields)})
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
            f"/{ig_user_id}/media",
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
        url = f"{GRAPH_API_BASE}{path}"
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
