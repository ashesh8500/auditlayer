from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from auditlayer_worker.pipeline import (
    _link_account_and_progression,
    _start_instagram_fetch,
)


class _Query:
    def __init__(self, table: str, calls: list[tuple]) -> None:
        self.table = table
        self.calls = calls
        self.data = [{"id": "account-1"}] if table == "accounts" else []

    def upsert(self, fields, **kwargs):
        self.calls.append((self.table, "upsert", fields, kwargs))
        return self

    def update(self, fields):
        self.calls.append((self.table, "update", fields, {}))
        return self

    def eq(self, *_args):
        return self

    def execute(self):
        return self


class _Client:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def table(self, name: str) -> _Query:
        return _Query(name, self.calls)


def _audit():
    return SimpleNamespace(
        id="audit-1",
        user_id="user-1",
        handle="creator",
        platform="instagram",
    )


def _metrics():
    return SimpleNamespace(
        profile=SimpleNamespace(followers_count=1000),
        avg_engagement_rate=2.5,
        avg_likes=40.0,
        avg_comments=5.0,
    )


def test_reusing_research_does_not_slide_cache_expiry() -> None:
    gateway = SimpleNamespace(client=_Client())

    _link_account_and_progression(
        gateway,
        _audit(),
        _metrics(),
        research_cache="old evidence",
        research_refreshed=False,
    )

    account_fields = gateway.client.calls[0][2]
    assert account_fields == {
        "user_id": "user-1",
        "handle": "creator",
        "platform": "instagram",
        "ownership_status": "connected",
    }


def test_fresh_research_gets_bounded_24_hour_expiry() -> None:
    gateway = SimpleNamespace(client=_Client())
    before = datetime.now(timezone.utc)

    _link_account_and_progression(
        gateway,
        _audit(),
        _metrics(),
        research_cache="fresh evidence",
        research_refreshed=True,
    )

    account_fields = gateway.client.calls[0][2]
    expiry = datetime.fromisoformat(account_fields["cache_valid_until"])
    ttl_hours = (expiry - before).total_seconds() / 3600
    assert 23.9 <= ttl_hours <= 24.1
    assert account_fields["research_snapshot"] == "fresh evidence"


def test_public_audit_target_is_not_promoted_to_workspace_account() -> None:
    gateway = SimpleNamespace(client=_Client())

    _link_account_and_progression(
        gateway,
        _audit(),
        None,
        score=62,
        research_refreshed=False,
    )

    assert gateway.client.calls == []


def test_connected_instagram_failure_refuses_stale_fallback() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = (
        "token",
        123,
        "2026-09-18T00:00:00+00:00",
    )
    sink = MagicMock()

    with patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.get_full_metrics",
        side_effect=RuntimeError("graph unavailable"),
    ), patch("auditlayer_worker.instagram_api.InstagramAPIClient.close"):
        future = _start_instagram_fetch(gateway, _audit(), sink)
        with pytest.raises(RuntimeError, match="refusing stale fallback"):
            future.result(timeout=2)

    sink.emit.assert_any_call(
        "failed",
        "Connected Instagram data was unavailable. The audit will retry rather than use stale public metrics.",
        event_type="instagram_api_required",
    )


def test_live_instagram_snapshot_refreshes_connection_health() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = (
        "token",
        123,
        "2026-09-18T00:00:00+00:00",
    )
    sink = MagicMock()
    profile = SimpleNamespace(
        account_type="CREATOR",
        followers_count=1110,
        media_count=42,
        fetched_at="2026-07-19T00:00:00+00:00",
    )
    metrics = SimpleNamespace(
        profile=profile,
        recent_media=[],
        avg_engagement_rate=1.2,
    )

    with patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.get_full_metrics",
        return_value=metrics,
    ), patch("auditlayer_worker.instagram_api.InstagramAPIClient.close"):
        result = _start_instagram_fetch(gateway, _audit(), sink).result(timeout=2)

    assert result is metrics
    gateway.refresh_instagram_connection.assert_called_once_with(
        user_id="user-1",
        ig_user_id=123,
        account_type="CREATOR",
        followers_count=1110,
        media_count=42,
        observed_at="2026-07-19T00:00:00+00:00",
    )
