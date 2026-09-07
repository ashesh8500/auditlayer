"""Tests for the Instagram Graph API client and summarization."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import threading
import time

import httpx
import pytest

from auditlayer_worker.instagram_api import (
    FACEBOOK_GRAPH_API_BASE,
    INSTAGRAM_GRAPH_API_BASE,
    InstagramAPIClient,
    InstagramAPIError,
    InstagramErrorKind,
    InstagramMedia,
    MediaSummary,
    should_refresh_instagram_token,
    summarize_media,
)
from auditlayer_worker.supabase_client import SupabaseGateway


def test_instagram_connection_lookup_distinguishes_no_active_connection():
    class Query:
        def select(self, *_args): return self
        def eq(self, *_args): return self
        def order(self, *_args, **_kwargs): return self
        def limit(self, *_args): return self
        def execute(self): return SimpleNamespace(data=[])

    gateway = object.__new__(SupabaseGateway)
    gateway.client = SimpleNamespace(table=lambda _name: Query())

    lookup = gateway.get_instagram_token("auditlayermedia", "customer-1")

    assert lookup.state.value == "not_found"


def test_instagram_connection_lookup_honors_durable_reconnect_state_without_hiding_inactive_row():
    class Query:
        def __init__(self):
            self.filters = []

        def select(self, *_args): return self
        def eq(self, *args):
            self.filters.append(args)
            return self
        def order(self, *_args, **_kwargs): return self
        def limit(self, *_args): return self
        def execute(self):
            return SimpleNamespace(data=[{
                "id": "connection-1",
                "ig_user_id": 123,
                "long_lived_token": "still-present-but-revoked",
                "long_lived_expires_at": "2099-01-01T00:00:00+00:00",
                "graph_api_family": "instagram",
                "connection_status": "reconnect_required",
                "is_active": False,
            }])

    query = Query()
    gateway = object.__new__(SupabaseGateway)
    gateway.client = SimpleNamespace(table=lambda _name: query)

    lookup = gateway.get_instagram_token("auditlayermedia", "customer-1")

    assert lookup.state.value == "reconnect_required"
    assert lookup.connection_id == "connection-1"
    assert ("is_active", True) not in query.filters


def test_instagram_token_lookup_uses_supported_desc_order():
    class Query:
        def __init__(self):
            self.order_kwargs = None
            self.filters = []

        def select(self, *_args): return self
        def eq(self, *args):
            self.filters.append(args)
            return self
        def limit(self, *_args): return self

        def order(self, *_args, **kwargs):
            self.order_kwargs = kwargs
            return self

        def execute(self):
            return SimpleNamespace(
                data=[{
                    "id": "connection-1",
                    "ig_user_id": 123,
                    "long_lived_token": "token",
                    "long_lived_expires_at": "2099-01-01T00:00:00+00:00",
                    "graph_api_family": "instagram",
                    "connection_status": "connected",
                    "is_active": True,
                }]
            )

    query = Query()
    gateway = object.__new__(SupabaseGateway)
    gateway.client = SimpleNamespace(table=lambda _name: query)

    lookup = gateway.get_instagram_token("auditlayermedia", "customer-1")

    assert lookup.state.value == "usable"
    assert lookup.token == "token"
    assert lookup.ig_user_id == 123
    assert lookup.expires_at == "2099-01-01T00:00:00+00:00"
    assert lookup.graph_api_family == "instagram"
    assert query.order_kwargs == {"desc": True}
    assert ("user_id", "customer-1") in query.filters


@pytest.mark.parametrize(
    "invalid_field",
    [
        {"long_lived_token": None},
        {"long_lived_expires_at": "2000-01-01T00:00:00+00:00"},
        {"long_lived_expires_at": "not-a-timestamp"},
        {"long_lived_expires_at": None},
        {"ig_user_id": None},
        {"graph_api_family": None},
        {"graph_api_family": "unknown"},
    ],
)
def test_active_unusable_instagram_connections_require_reconnect(invalid_field):
    row = {
        "id": "connection-1",
        "ig_user_id": 123,
        "long_lived_token": "opaque-token",
        "long_lived_expires_at": "2099-01-01T00:00:00+00:00",
        "graph_api_family": "instagram",
        "connection_status": "connected",
        "is_active": True,
        **invalid_field,
    }

    class Query:
        def select(self, *_args): return self
        def eq(self, *_args): return self
        def order(self, *_args, **_kwargs): return self
        def limit(self, *_args): return self
        def execute(self): return SimpleNamespace(data=[row])

    gateway = object.__new__(SupabaseGateway)
    gateway.client = SimpleNamespace(table=lambda _name: Query())

    lookup = gateway.get_instagram_token("auditlayermedia", "customer-1")

    assert lookup.state.value == "reconnect_required"
    assert lookup.token is None


@pytest.mark.parametrize(
    ("token", "graph_api_family", "expected_base", "expected_profile", "expected_media"),
    [
        ("opaque-direct-token", "instagram", INSTAGRAM_GRAPH_API_BASE, "/me", "/me/media"),
        ("IGA_misleading_prefix", "facebook", FACEBOOK_GRAPH_API_BASE, "/999", "/999/media"),
    ],
)
def test_instagram_client_selects_endpoint_for_token_type(
    token, graph_api_family, expected_base, expected_profile, expected_media
):
    client = InstagramAPIClient(token, graph_api_family=graph_api_family)
    seen = []

    def fake_get(path, params=None, **_kwargs):
        seen.append(path)
        if path.endswith("/media"):
            return {"data": []}
        return {
            ("user_id" if graph_api_family == "instagram" else "id"): "999",
            "username": "auditlayermedia",
        }

    client._get = fake_get
    try:
        client.get_profile(999)
        client.get_recent_media(999)
    finally:
        client.close()

    assert client._base_url == expected_base
    assert seen == [expected_profile, expected_media]


def test_missing_profile_and_media_counts_remain_none_while_zero_remains_zero():
    client = InstagramAPIClient("opaque-token", graph_api_family="instagram")
    responses = {
        "/me": {
            "user_id": "999",
            "username": "auditlayermedia",
        },
        "/me/media": {
            "data": [
                {"id": "missing", "media_type": "IMAGE"},
                {
                    "id": "zero",
                    "media_type": "VIDEO",
                    "like_count": 0,
                    "comments_count": 0,
                },
            ]
        },
    }
    def fake_get(path, params=None, *, expected_unavailable=False, deadline=None):
        del params, expected_unavailable, deadline
        return responses[path]

    client._get = fake_get

    try:
        profile = client.get_profile(999)
        media = client.get_recent_media(999)
    finally:
        client.close()

    assert profile.followers_count is None
    assert profile.follows_count is None
    assert profile.media_count is None
    assert media[0].like_count is None
    assert media[0].comments_count is None
    assert media[1].like_count == 0
    assert media[1].comments_count == 0


def test_idempotent_get_retries_rate_limit_after_retry_after(monkeypatch):
    sleeps: list[float] = []
    client = InstagramAPIClient(
        "opaque-direct-token",
        graph_api_family="instagram",
        sleep=sleeps.append,
    )
    responses = [
        httpx.Response(
            429,
            headers={"Retry-After": "0.25"},
            json={"error": {"code": 4, "message": "rate limited"}},
            request=httpx.Request("GET", "https://graph.instagram.com/v21.0/me"),
        ),
        httpx.Response(
            200,
            json={"user_id": "999", "username": "auditlayermedia"},
            request=httpx.Request("GET", "https://graph.instagram.com/v21.0/me"),
        ),
    ]
    def fake_get(*_args, **_kwargs):
        return responses.pop(0)

    monkeypatch.setattr(client._client, "get", fake_get)
    try:
        profile = client.get_profile(999)
    finally:
        client.close()

    assert profile.ig_user_id == 999
    assert sleeps == [0.25]
    assert responses == []


def test_full_metrics_uses_successful_reach_rows_and_reports_eligible_denominator():
    client = InstagramAPIClient("opaque-token", graph_api_family="instagram")

    def fake_get(path, params=None, **kwargs):
        if path == "/me":
            return {
                "user_id": "999",
                "username": "auditlayermedia",
                "followers_count": 1000,
                "account_type": "BUSINESS",
            }
        if path == "/me/media":
            return {
                "data": [
                    {"id": "media-1", "media_type": "IMAGE", "like_count": 20},
                    {"id": "media-2", "media_type": "VIDEO", "like_count": 40},
                    {"id": "media-3", "media_type": "IMAGE", "like_count": 60},
                ]
            }
        assert kwargs["expected_unavailable"] is True
        assert isinstance(kwargs["deadline"], float)
        if path == "/media-1/insights":
            return {"data": [{"name": "reach", "values": [{"value": 120}]}]}
        if path == "/media-2/insights":
            raise InstagramAPIError(InstagramErrorKind.EXPECTED_UNAVAILABLE)
        return {"data": []}

    client._get = fake_get
    try:
        metrics = client.get_full_metrics(999)
    finally:
        client.close()

    assert metrics.avg_reach == 120.0
    assert metrics.reach_media_count == 1
    assert metrics.reach_eligible_media_count == 2
    assert [item.reach for item in metrics.recent_media] == [120, None, None]
    assert metrics._raw == {
        "insights_media_count": 1,
        "insights_eligible_media_count": 2,
        "insights_attempted_media_count": 3,
        "insights_unavailable_media_count": 1,
        "insights_error_media_count": 0,
    }


def test_full_metrics_keeps_all_missing_reach_unavailable():
    client = InstagramAPIClient("opaque-direct-token", graph_api_family="instagram")
    client.get_profile = lambda _ig_user_id, **_kwargs: SimpleNamespace(
        followers_count=1000
    )
    client.get_recent_media = lambda _ig_user_id, limit=25, **_kwargs: [
        InstagramMedia(id="media-1", media_type="IMAGE", like_count=20),
        InstagramMedia(id="media-2", media_type="VIDEO", like_count=40),
    ]
    client.get_media_insights = lambda _media_id, **_kwargs: {}
    try:
        metrics = client.get_full_metrics(999)
    finally:
        client.close()

    assert metrics.avg_reach is None
    assert metrics.reach_media_count == 0
    assert metrics.reach_eligible_media_count == 2
    assert metrics.avg_likes == 30.0


def test_full_metrics_bounds_parallel_insight_requests():
    client = InstagramAPIClient(
        "opaque-direct-token",
        graph_api_family="instagram",
        insights_concurrency=2,
    )
    client.get_profile = lambda _ig_user_id, **_kwargs: SimpleNamespace(followers_count=1000)
    client.get_recent_media = lambda _ig_user_id, limit=25, **_kwargs: [
        InstagramMedia(id=f"media-{index}", media_type="IMAGE")
        for index in range(6)
    ]
    lock = threading.Lock()
    active = 0
    maximum_active = 0

    def fake_insights(_media_id, **_kwargs):
        nonlocal active, maximum_active
        with lock:
            active += 1
            maximum_active = max(maximum_active, active)
        time.sleep(0.02)
        with lock:
            active -= 1
        return {"reach": 100}

    client.get_media_insights = fake_insights
    try:
        metrics = client.get_full_metrics(999)
    finally:
        client.close()

    assert maximum_active == 2
    assert metrics.reach_media_count == 6


@pytest.mark.parametrize(
    ("status", "graph_code", "message", "expected_kind"),
    [
        (
            400,
            100,
            "Media was posted before account conversion and is not eligible for insights.",
            InstagramErrorKind.EXPECTED_UNAVAILABLE,
        ),
        (
            400,
            10,
            "(#10) Not enough viewers for the media to show insights",
            InstagramErrorKind.EXPECTED_UNAVAILABLE,
        ),
        (403, 10, "Application does not have permission", InstagramErrorKind.AUTH_PERMISSION),
        (503, 2, "Service temporarily unavailable", InstagramErrorKind.TRANSIENT),
        (400, 100, "Invalid metric name", InstagramErrorKind.PERMANENT),
    ],
)
def test_media_insight_failures_have_stable_classification(
    monkeypatch,
    status,
    graph_code,
    message,
    expected_kind,
):
    client = InstagramAPIClient(
        "opaque-direct-token",
        graph_api_family="instagram",
        max_retries=0,
    )
    response = httpx.Response(
        status,
        json={"error": {"code": graph_code, "message": message}},
        request=httpx.Request(
            "GET",
            "https://graph.instagram.com/v21.0/media-1/insights",
        ),
    )
    monkeypatch.setattr(client._client, "get", lambda *_args, **_kwargs: response)
    try:
        with pytest.raises(InstagramAPIError) as caught:
            client.get_media_insights("media-1")
    finally:
        client.close()

    assert caught.value.kind == expected_kind


def test_token_refresh_retries_stay_inside_total_deadline(monkeypatch):
    now = [0.0]
    sleeps: list[float] = []

    def sleep(seconds):
        sleeps.append(seconds)
        now[0] += seconds

    client = InstagramAPIClient(
        "opaque-direct-token",
        graph_api_family="instagram",
        max_retries=2,
        total_deadline_seconds=0.5,
        sleep=sleep,
        monotonic=lambda: now[0],
    )
    calls = 0
    response = httpx.Response(
        429,
        headers={"Retry-After": "0.3"},
        json={"error": {"code": 4, "message": "rate limited"}},
        request=httpx.Request(
            "GET",
            "https://graph.instagram.com/refresh_access_token",
        ),
    )

    def fake_get(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return response

    monkeypatch.setattr(client._client, "get", fake_get)
    try:
        with pytest.raises(InstagramAPIError) as caught:
            client.refresh_long_lived_token()
    finally:
        client.close()

    assert caught.value.kind == InstagramErrorKind.TRANSIENT
    assert calls == 2
    assert sleeps == [0.3]


def test_success_status_with_invalid_json_is_classified_transient(monkeypatch):
    client = InstagramAPIClient(
        "opaque-direct-token",
        graph_api_family="instagram",
        max_retries=0,
    )
    response = httpx.Response(
        200,
        text="upstream returned non-json",
        request=httpx.Request("GET", "https://graph.instagram.com/v21.0/me"),
    )
    monkeypatch.setattr(client._client, "get", lambda *_args, **_kwargs: response)
    try:
        with pytest.raises(InstagramAPIError) as caught:
            client.get_profile(999)
    finally:
        client.close()

    assert caught.value.kind == InstagramErrorKind.TRANSIENT


def test_instagram_login_token_can_be_refreshed(monkeypatch):
    client = InstagramAPIClient("IGA_old", graph_api_family="instagram")
    seen = {}

    def fake_get(url, params, **_kwargs):
        seen["url"] = url
        seen["params"] = params
        return httpx.Response(
            200,
            json={"access_token": "IGA_new", "expires_in": 5_184_000},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(client._client, "get", fake_get)
    try:
        token, expires_in = client.refresh_long_lived_token()
    finally:
        client.close()

    assert token == "IGA_new"
    assert expires_in == 5_184_000
    assert seen == {
        "url": "https://graph.instagram.com/refresh_access_token",
        "params": {
            "grant_type": "ig_refresh_token",
            "access_token": "IGA_old",
        },
    }


def test_instagram_token_refresh_window_is_seven_days():
    now = datetime(2026, 7, 20, tzinfo=timezone.utc)
    assert should_refresh_instagram_token(
        (now + timedelta(days=6)).isoformat(), now=now
    )
    assert not should_refresh_instagram_token(
        (now + timedelta(days=8)).isoformat(), now=now
    )


def test_gateway_persists_refreshed_instagram_token():
    class Query:
        def __init__(self):
            self.values = None
            self.filters = []

        def update(self, values):
            self.values = values
            return self

        def eq(self, *args):
            self.filters.append(args)
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    query = Query()
    gateway = object.__new__(SupabaseGateway)
    gateway.client = SimpleNamespace(table=lambda _name: query)

    gateway.update_instagram_token(
        user_id="customer-1",
        ig_user_id=123,
        token="IGA_new",
        expires_at="2026-09-18T00:00:00+00:00",
    )

    assert query.values["long_lived_token"] == "IGA_new"
    assert query.values["long_lived_expires_at"] == "2026-09-18T00:00:00+00:00"
    assert ("user_id", "customer-1") in query.filters
    assert ("ig_user_id", 123) in query.filters


def test_gateway_marks_reconnect_required_with_owner_and_connection_ids_only():
    calls = []

    class Rpc:
        def execute(self):
            return SimpleNamespace(data=True)

    class Client:
        def rpc(self, name, args):
            calls.append((name, args))
            return Rpc()

    gateway = object.__new__(SupabaseGateway)
    gateway.client = Client()

    marked = gateway.mark_instagram_connection_reconnect_required(
        user_id="customer-1",
        connection_id="connection-1",
    )

    assert marked is True
    assert calls == [(
        "mark_instagram_connection_reconnect_required",
        {"p_user_id": "customer-1", "p_connection_id": "connection-1"},
    )]



def _make_media(
    media_id: str,
    media_type: str = "IMAGE",
    likes: int = 100,
    comments: int = 10,
    caption: str = "Test caption about biohacking",
    timestamp: str | None = None,
) -> InstagramMedia:
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    er = round((likes + comments) / 10000 * 100, 2)  # assume 10k followers
    return InstagramMedia(
        id=media_id,
        media_type=media_type,
        caption=caption,
        permalink=f"https://instagram.com/p/{media_id}/",
        timestamp=ts,
        like_count=likes,
        comments_count=comments,
        engagement_rate=er,
    )


# ---------------------------------------------------------------------------
# summarize_media — empty input
# ---------------------------------------------------------------------------


def test_summarize_media_empty():
    """Empty media list produces an empty summary (no crashes)."""
    summary = summarize_media([])
    assert isinstance(summary, MediaSummary)
    assert summary.post_count == 0
    assert summary.avg_likes == 0.0
    assert summary.avg_comments == 0.0
    assert summary.top_posts == []
    assert summary.format_mix == {}
    assert summary.cadence_days == 0.0
    assert summary.common_themes == []


# ---------------------------------------------------------------------------
# summarize_media — single post
# ---------------------------------------------------------------------------


def test_summarize_media_single_post():
    """A single post should produce correct averages and no cadence."""
    media = [_make_media("p1", likes=500, comments=25)]
    summary = summarize_media(media)
    assert summary.post_count == 1
    assert summary.avg_likes == 500.0
    assert summary.avg_comments == 25.0
    assert len(summary.top_posts) == 1
    assert summary.top_posts[0]["likes"] == 500
    assert summary.format_mix == {"IMAGE": 1}
    assert summary.cadence_days == 0.0  # need >= 2 posts for cadence
    assert "biohacking" in summary.common_themes


# ---------------------------------------------------------------------------
# summarize_media — multiple posts
# ---------------------------------------------------------------------------


def test_summarize_media_top_posts():
    """Top posts are ranked by engagement (likes + comments)."""
    media = [
        _make_media("p1", likes=100, comments=10),   # 110
        _make_media("p2", likes=500, comments=50),    # 550
        _make_media("p3", likes=300, comments=30),    # 330
        _make_media("p4", likes=50, comments=5),      # 55
        _make_media("p5", likes=200, comments=20),    # 220
    ]
    summary = summarize_media(media, top_n_posts=3)
    assert summary.post_count == 5
    assert len(summary.top_posts) == 3
    assert summary.top_posts[0]["likes"] == 500  # p2
    assert summary.top_posts[1]["likes"] == 300  # p3
    assert summary.top_posts[2]["likes"] == 200  # p5


def test_summarize_media_format_mix():
    """Format mix counts media types correctly."""
    media = [
        _make_media("p1", media_type="IMAGE"),
        _make_media("p2", media_type="IMAGE"),
        _make_media("p3", media_type="VIDEO"),
        _make_media("p4", media_type="CAROUSEL_ALBUM"),
    ]
    summary = summarize_media(media)
    assert summary.format_mix == {"IMAGE": 2, "VIDEO": 1, "CAROUSEL_ALBUM": 1}


def test_summarize_media_cadence():
    """Cadence is computed correctly from timestamps."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    media = [
        _make_media("p1", timestamp=(now - timedelta(days=10)).isoformat()),
        _make_media("p2", timestamp=(now - timedelta(days=5)).isoformat()),
        _make_media("p3", timestamp=now.isoformat()),
    ]
    summary = summarize_media(media)
    # 3 posts over 10 days → 10 / 2 = 5.0 days between posts
    assert summary.cadence_days == 5.0


def test_summarize_media_no_caption():
    """Posts without captions don't crash theme extraction."""
    media = [
        _make_media("p1", caption=""),
        _make_media("p2", caption="  "),  # whitespace only
    ]
    summary = summarize_media(media)
    assert summary.post_count == 2
    assert summary.common_themes == []  # no meaningful captions


def test_summarize_media_theme_extraction():
    """Common themes are extracted from caption repetition."""
    media = [
        _make_media("p1", caption="biohacking mitochondria health longevity"),
        _make_media("p2", caption="biohacking sauna cold exposure"),
        _make_media("p3", caption="biohacking fasting longevity"),
    ]
    summary = summarize_media(media)
    assert "biohacking" in summary.common_themes
    assert "longevity" in summary.common_themes


# ---------------------------------------------------------------------------
# import / smoke
# ---------------------------------------------------------------------------


def test_media_summary_dataclass_fields():
    """MediaSummary has all expected fields."""
    s = MediaSummary(
        post_count=10,
        avg_likes=250.0,
        avg_comments=12.5,
        top_posts=[{"id": "p1", "likes": 500}],
        format_mix={"IMAGE": 8, "VIDEO": 2},
        cadence_days=3.0,
        common_themes=["biohacking", "longevity"],
    )
    assert s.post_count == 10
    assert s.avg_likes == 250.0
    assert s.cadence_days == 3.0
    assert "biohacking" in s.common_themes
