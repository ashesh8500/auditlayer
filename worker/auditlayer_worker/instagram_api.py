"""Instagram Graph API client for the AuditLayer worker.

Fetches live profile, media, and (optionally) insights data for Instagram
Business/Creator accounts connected via OAuth. When no token is available or
the token is expired, callers should fall back to the free-toolset path
(web indexation + browser research + limitations flag).
"""

from __future__ import annotations

from collections import Counter
from concurrent.futures import (
    ThreadPoolExecutor,
    TimeoutError as FutureTimeoutError,
    as_completed,
)
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from enum import Enum
import re
import time
from typing import Any, Callable

import httpx

INSTAGRAM_GRAPH_API_BASE = "https://graph.instagram.com/v21.0"
FACEBOOK_GRAPH_API_BASE = "https://graph.facebook.com/v21.0"
INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS = 7


def _optional_int(value: Any) -> int | None:
    return None if value is None else int(value)


class InstagramErrorKind(str, Enum):
    """Stable failure classes used by retry and connected-data policy."""

    EXPECTED_UNAVAILABLE = "expected_unavailable"
    AUTH_PERMISSION = "auth_permission"
    TRANSIENT = "transient"
    PERMANENT = "permanent"


class GraphAPIFamily(str, Enum):
    """Explicit Graph host/token family persisted with each connection."""

    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"


class InstagramAPIError(RuntimeError):
    """Privacy-safe Graph API failure with explicit retry semantics."""

    def __init__(
        self,
        kind: InstagramErrorKind,
        *,
        status_code: int | None = None,
        graph_code: int | None = None,
    ) -> None:
        super().__init__(f"Instagram Graph API request failed: {kind.value}")
        self.kind = kind
        self.status_code = status_code
        self.graph_code = graph_code

    @property
    def retryable(self) -> bool:
        return self.kind == InstagramErrorKind.TRANSIENT


_TRANSIENT_GRAPH_CODES = {1, 2, 4, 17, 32, 341, 613, 80004}
_AUTH_PERMISSION_GRAPH_CODES = {10, 190, 200}
_EXPECTED_UNAVAILABLE_MARKERS = (
    "insights are not available",
    "insights not available",
    "does not have insights",
    "media is not eligible",
    "media not eligible",
    "not eligible for insights",
    "not enough viewers for the media to show insights",
)


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
    followers_count: int | None = None
    follows_count: int | None = None
    media_count: int | None = None
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
    like_count: int | None = None
    comments_count: int | None = None
    reach: int | None = None
    engagement_rate: float | None = None


@dataclass
class InstagramMetrics:
    """Aggregated metrics the worker uses for report generation."""

    profile: InstagramProfile
    recent_media: list[InstagramMedia] = field(default_factory=list)
    avg_likes: float | None = None
    avg_comments: float | None = None
    avg_reach: float | None = None
    reach_media_count: int = 0
    reach_eligible_media_count: int = 0
    avg_engagement_rate: float | None = None
    posting_cadence: str = ""
    top_content_types: list[str] = field(default_factory=list)
    _raw: dict[str, Any] | None = None


@dataclass
class MediaSummary:
    """Deterministic summary of recent media for prompt construction and QA."""

    post_count: int
    avg_likes: float | None
    avg_comments: float | None
    top_posts: list[dict[str, Any]]
    format_mix: dict[str, int]
    cadence_days: float
    common_themes: list[str]


# ── API client ────────────────────────────────────────────────


class InstagramAPIClient:
    """Fetches data from the Instagram Graph API using a stored access token."""

    def __init__(
        self,
        access_token: str,
        *,
        graph_api_family: GraphAPIFamily | str,
        max_retries: int = 2,
        insights_concurrency: int = 4,
        total_deadline_seconds: float = 20.0,
        request_timeout_seconds: float = 5.0,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ):
        self._token = access_token
        try:
            self._graph_api_family = GraphAPIFamily(graph_api_family)
        except ValueError as exc:
            raise ValueError("Unsupported Instagram graph_api_family") from exc
        self._instagram_login = self._graph_api_family == GraphAPIFamily.INSTAGRAM
        self._base_url = (
            INSTAGRAM_GRAPH_API_BASE if self._instagram_login else FACEBOOK_GRAPH_API_BASE
        )
        self._max_retries = max(0, max_retries)
        self._insights_concurrency = max(1, min(insights_concurrency, 8))
        self._total_deadline_seconds = max(0.1, total_deadline_seconds)
        self._request_timeout_seconds = max(0.1, request_timeout_seconds)
        self._sleep = sleep
        self._monotonic = monotonic
        self._client = httpx.Client(timeout=self._request_timeout_seconds)

    def close(self) -> None:
        self._client.close()

    def refresh_long_lived_token(self) -> tuple[str, int]:
        """Refresh a direct Instagram Login token for another 60-day window."""
        if not self._instagram_login:
            raise ValueError("Only Instagram Login tokens can use the refresh endpoint")
        deadline = self._monotonic() + self._total_deadline_seconds
        data = self._request_get(
            "https://graph.instagram.com/refresh_access_token",
            params={
                "grant_type": "ig_refresh_token",
                "access_token": self._token,
            },
            deadline=deadline,
        )
        token = str(data.get("access_token") or "")
        if not token:
            raise ValueError("Instagram refresh did not return an access token")
        return token, int(data.get("expires_in") or 5_184_000)

    # ── Profile ───────────────────────────────────────────────

    def get_profile(
        self,
        ig_user_id: int,
        *,
        deadline: float | None = None,
    ) -> InstagramProfile:
        """Fetch profile data for a connected Instagram Business/Creator account."""
        fields = [
            "user_id" if self._instagram_login else "id",
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
        data = self._get(
            user_path,
            params={"fields": ",".join(fields)},
            deadline=deadline,
        )
        return InstagramProfile(
            ig_user_id=int(data["user_id"] if self._instagram_login else data["id"]),
            username=data.get("username", ""),
            name=data.get("name", ""),
            biography=data.get("biography", ""),
            followers_count=_optional_int(data.get("followers_count")),
            follows_count=_optional_int(data.get("follows_count")),
            media_count=_optional_int(data.get("media_count")),
            profile_picture_url=data.get("profile_picture_url", ""),
            website=data.get("website", ""),
            account_type=data.get("account_type", ""),
        )

    # ── Media ─────────────────────────────────────────────────

    def get_recent_media(
        self,
        ig_user_id: int,
        limit: int = 25,
        *,
        deadline: float | None = None,
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
            deadline=deadline,
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
                    like_count=_optional_int(item.get("like_count")),
                    comments_count=_optional_int(item.get("comments_count")),
                )
            )
        return media_list

    # ── Insights (requires instagram_business_manage_insights) ─

    def get_media_insights(
        self,
        media_id: str,
        *,
        deadline: float | None = None,
    ) -> dict[str, int]:
        """Fetch private reach without coercing an absent row to zero."""
        data = self._get(
            f"/{media_id}/insights",
            params={"metric": "reach"},
            expected_unavailable=True,
            deadline=deadline,
        )
        insights: dict[str, int] = {}
        for item in data.get("data", []):
            values = item.get("values") or []
            if not values:
                continue
            value = values[0].get("value")
            if value is not None:
                insights[str(item.get("name") or "")] = int(value)
        return insights

    # ── Aggregate ─────────────────────────────────────────────

    def get_full_metrics(self, ig_user_id: int) -> InstagramMetrics:
        """Fetch profile + recent media + compute aggregate metrics."""
        deadline = self._monotonic() + self._total_deadline_seconds
        profile = self.get_profile(ig_user_id, deadline=deadline)
        media = self.get_recent_media(ig_user_id, limit=25, deadline=deadline)

        attempted_media = [item for item in media[:10] if item.id]
        insight_reaches: list[int] = []
        eligible_media_count = 0
        unavailable_media_count = 0
        error_media_count = 0

        def fetch_reach(
            item: InstagramMedia,
        ) -> tuple[InstagramMedia, int | None, bool]:
            try:
                insights = self.get_media_insights(item.id, deadline=deadline)
            except InstagramAPIError as exc:
                if exc.kind == InstagramErrorKind.EXPECTED_UNAVAILABLE:
                    return item, None, False
                raise
            return item, insights.get("reach"), True

        executor = ThreadPoolExecutor(
            max_workers=self._insights_concurrency,
            thread_name_prefix="instagram-insights",
        )
        futures = [executor.submit(fetch_reach, item) for item in attempted_media]
        try:
            remaining = max(0.0, deadline - self._monotonic())
            for future in as_completed(futures, timeout=remaining):
                try:
                    item, reach, eligible = future.result()
                except Exception:
                    error_media_count += 1
                    raise
                if not eligible:
                    unavailable_media_count += 1
                    continue
                eligible_media_count += 1
                if reach is not None:
                    item.reach = reach
                    insight_reaches.append(reach)
        except FutureTimeoutError as exc:
            raise InstagramAPIError(InstagramErrorKind.TRANSIENT) from exc
        finally:
            executor.shutdown(wait=True, cancel_futures=True)

        # Compute engagement per post
        for m in media:
            if (
                profile.followers_count is not None
                and profile.followers_count > 0
                and m.like_count is not None
                and m.comments_count is not None
            ):
                m.engagement_rate = round(
                    (m.like_count + m.comments_count)
                    / profile.followers_count
                    * 100,
                    2,
                )

        # Aggregate stats
        known_likes = [m.like_count for m in media if m.like_count is not None]
        known_comments = [m.comments_count for m in media if m.comments_count is not None]
        known_engagement = [
            m.engagement_rate for m in media if m.engagement_rate is not None
        ]
        avg_likes = sum(known_likes) / len(known_likes) if known_likes else None
        avg_comments = (
            sum(known_comments) / len(known_comments) if known_comments else None
        )
        avg_er = (
            sum(known_engagement) / len(known_engagement)
            if known_engagement
            else None
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
            avg_likes=round(avg_likes, 1) if avg_likes is not None else None,
            avg_comments=(
                round(avg_comments, 1) if avg_comments is not None else None
            ),
            avg_reach=(
                round(sum(insight_reaches) / len(insight_reaches), 1)
                if insight_reaches
                else None
            ),
            reach_media_count=len(insight_reaches),
            reach_eligible_media_count=eligible_media_count,
            avg_engagement_rate=round(avg_er, 2) if avg_er is not None else None,
            posting_cadence=cadence,
            top_content_types=top_types,
            _raw={
                "insights_media_count": len(insight_reaches),
                "insights_eligible_media_count": eligible_media_count,
                "insights_attempted_media_count": len(attempted_media),
                "insights_unavailable_media_count": unavailable_media_count,
                "insights_error_media_count": error_media_count,
            },
        )

    # ── Helpers ───────────────────────────────────────────────

    def _get(
        self,
        path: str,
        params: dict[str, str] | None = None,
        *,
        expected_unavailable: bool = False,
        deadline: float | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        p = dict(params or {})
        p["access_token"] = self._token
        return self._request_get(
            url,
            params=p,
            expected_unavailable=expected_unavailable,
            deadline=deadline,
        )

    def _request_get(
        self,
        url: str,
        *,
        params: dict[str, str],
        expected_unavailable: bool = False,
        deadline: float | None = None,
    ) -> dict[str, Any]:
        for attempt in range(self._max_retries + 1):
            remaining = (
                self._request_timeout_seconds
                if deadline is None
                else deadline - self._monotonic()
            )
            if remaining <= 0:
                raise InstagramAPIError(InstagramErrorKind.TRANSIENT)
            response: httpx.Response | None = None
            try:
                response = self._client.get(
                    url,
                    params=params,
                    timeout=min(self._request_timeout_seconds, remaining),
                )
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                error = InstagramAPIError(InstagramErrorKind.TRANSIENT)
                if attempt >= self._max_retries:
                    raise error from exc
            else:
                if response.is_success:
                    try:
                        data = response.json()
                    except ValueError:
                        error = InstagramAPIError(InstagramErrorKind.TRANSIENT)
                    else:
                        if isinstance(data, dict):
                            return data
                        error = InstagramAPIError(InstagramErrorKind.PERMANENT)
                else:
                    error = _classify_graph_response(
                        response,
                        expected_unavailable=expected_unavailable,
                    )
                if not error.retryable or attempt >= self._max_retries:
                    raise error

            delay = _retry_after_seconds(response) if response is not None else None
            backoff = delay if delay is not None else min(0.25 * (2**attempt), 2.0)
            if deadline is not None and backoff >= deadline - self._monotonic():
                raise error
            self._sleep(backoff)

        raise AssertionError("bounded retry loop exhausted")


# ── Utilities ─────────────────────────────────────────────────


def _classify_graph_response(
    response: httpx.Response,
    *,
    expected_unavailable: bool,
) -> InstagramAPIError:
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    raw_error = payload.get("error", {}) if isinstance(payload, dict) else {}
    graph_code = raw_error.get("code") if isinstance(raw_error, dict) else None
    try:
        graph_code = int(graph_code) if graph_code is not None else None
    except (TypeError, ValueError):
        graph_code = None
    message = str(raw_error.get("message") or "").lower() if isinstance(raw_error, dict) else ""

    if (
        expected_unavailable
        and response.status_code in {400, 404}
        and any(marker in message for marker in _EXPECTED_UNAVAILABLE_MARKERS)
    ):
        kind = InstagramErrorKind.EXPECTED_UNAVAILABLE
    elif response.status_code in {401, 403} or graph_code in _AUTH_PERMISSION_GRAPH_CODES:
        kind = InstagramErrorKind.AUTH_PERMISSION
    elif (
        response.status_code in {408, 425, 429}
        or response.status_code >= 500
        or graph_code in _TRANSIENT_GRAPH_CODES
    ):
        kind = InstagramErrorKind.TRANSIENT
    else:
        kind = InstagramErrorKind.PERMANENT
    return InstagramAPIError(
        kind,
        status_code=response.status_code,
        graph_code=graph_code,
    )


def _retry_after_seconds(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After", "").strip()
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())


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
        key=lambda item: (item.like_count or 0) + (item.comments_count or 0),
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

    known_likes = [item.like_count for item in media if item.like_count is not None]
    known_comments = [
        item.comments_count for item in media if item.comments_count is not None
    ]
    return MediaSummary(
        post_count=len(media),
        avg_likes=(round(sum(known_likes) / len(known_likes), 1) if known_likes else None),
        avg_comments=(
            round(sum(known_comments) / len(known_comments), 1)
            if known_comments
            else None
        ),
        top_posts=top_posts,
        format_mix=format_mix,
        cadence_days=cadence_days,
        common_themes=common_themes,
    )
