"""Tests for the Instagram Graph API client and summarization."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from auditlayer_worker.instagram_api import (
    FACEBOOK_GRAPH_API_BASE,
    INSTAGRAM_GRAPH_API_BASE,
    InstagramAPIClient,
    InstagramMedia,
    MediaSummary,
    summarize_media,
)
from auditlayer_worker.supabase_client import SupabaseGateway


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
                    "ig_user_id": 123,
                    "long_lived_token": "token",
                    "long_lived_expires_at": "2099-01-01T00:00:00+00:00",
                    "is_active": True,
                }]
            )

    query = Query()
    gateway = object.__new__(SupabaseGateway)
    gateway.client = SimpleNamespace(table=lambda _name: query)

    assert gateway.get_instagram_token("auditlayermedia", "customer-1") == ("token", 123)
    assert query.order_kwargs == {"desc": True}
    assert ("user_id", "customer-1") in query.filters


@pytest.mark.parametrize(
    ("token", "expected_base", "expected_profile", "expected_media"),
    [
        ("IGA_test", INSTAGRAM_GRAPH_API_BASE, "/me", "/me/media"),
        ("EA_test", FACEBOOK_GRAPH_API_BASE, "/999", "/999/media"),
    ],
)
def test_instagram_client_selects_endpoint_for_token_type(
    token, expected_base, expected_profile, expected_media
):
    client = InstagramAPIClient(token)
    seen = []

    def fake_get(path, params=None):
        seen.append(path)
        if path.endswith("/media"):
            return {"data": []}
        return {"id": "999", "username": "auditlayermedia"}

    client._get = fake_get
    try:
        client.get_profile(999)
        client.get_recent_media(999)
    finally:
        client.close()

    assert client._base_url == expected_base
    assert seen == [expected_profile, expected_media]



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
