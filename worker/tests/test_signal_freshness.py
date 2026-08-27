from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from auditlayer_worker.instagram_api import InstagramAPIError, InstagramErrorKind
from auditlayer_worker.pipeline import (
    _link_account_and_progression,
    _start_instagram_fetch,
)
from auditlayer_worker.supabase_client import (
    InstagramConnectionLookup,
    InstagramConnectionState,
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


@pytest.mark.parametrize("value", [None, 0])
def test_account_progression_preserves_unavailable_counts_and_real_zero(value) -> None:
    gateway = SimpleNamespace(client=_Client())
    metrics = SimpleNamespace(
        profile=SimpleNamespace(followers_count=value),
        avg_engagement_rate=value,
        avg_likes=value,
        avg_comments=value,
    )

    _link_account_and_progression(
        gateway,
        _audit(),
        metrics,
        research_refreshed=False,
    )

    progression_fields = next(
        fields
        for table, operation, fields, _kwargs in gateway.client.calls
        if table == "account_progression" and operation == "upsert"
    )
    if value is None:
        assert progression_fields["followers"] is None
        assert progression_fields["engagement"] is None
        assert progression_fields["avg_likes"] is None
        assert progression_fields["avg_comments"] is None
    else:
        assert progression_fields["followers"] == 0
        assert progression_fields["engagement"] == 0.0
        assert progression_fields["avg_likes"] == 0.0
        assert progression_fields["avg_comments"] == 0.0


def test_connected_instagram_failure_refuses_stale_fallback() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        state=InstagramConnectionState.USABLE,
        token="opaque-direct-token",
        ig_user_id=123,
        expires_at="2026-09-18T00:00:00+00:00",
        graph_api_family="instagram",
    )
    sink = MagicMock()

    with patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.get_full_metrics",
        side_effect=RuntimeError("graph unavailable"),
    ), patch("auditlayer_worker.instagram_api.InstagramAPIClient.close"), patch(
        "auditlayer_worker.pipeline.capture_worker_failure", create=True
    ) as capture:
        future = _start_instagram_fetch(gateway, _audit(), sink)
        with pytest.raises(RuntimeError, match="refusing stale fallback"):
            future.result(timeout=2)

    sink.emit.assert_any_call(
        "failed",
        "Connected Instagram data was unavailable. The audit will retry rather than use stale public metrics.",
        event_type="instagram_api_required",
    )
    capture.assert_called_once_with(
        capture.call_args.args[0],
        surface="instagram_graph",
        operation="metrics_fetch",
        status="failed",
    )
    assert isinstance(capture.call_args.args[0], RuntimeError)


def test_connection_lookup_failure_is_captured_without_customer_context() -> None:
    gateway = MagicMock()
    error = RuntimeError("private connection detail")
    gateway.get_instagram_token.side_effect = error
    sink = MagicMock()

    with patch(
        "auditlayer_worker.pipeline.capture_worker_failure", create=True
    ) as capture:
        with pytest.raises(RuntimeError, match="refusing public fallback"):
            _start_instagram_fetch(gateway, _audit(), sink).result(timeout=2)

    capture.assert_called_once_with(
        error,
        surface="instagram_connection",
        operation="connection_lookup",
        status="failed",
    )


def test_existing_unusable_connection_requires_reconnect_without_public_fallback() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        InstagramConnectionState.RECONNECT_REQUIRED
    )
    sink = MagicMock()

    with patch(
        "auditlayer_worker.pipeline.capture_worker_failure", create=True
    ) as capture:
        with pytest.raises(RuntimeError, match="reconnect_required"):
            _start_instagram_fetch(gateway, _audit(), sink).result(timeout=2)

    capture.assert_called_once_with(
        capture.call_args.args[0],
        surface="instagram_connection",
        operation="connection_lookup",
        status="rejected",
    )
    assert str(capture.call_args.args[0]) == "instagram_reconnect_required"
    sink.emit.assert_called_once_with(
        "failed",
        "Instagram must be reconnected before live metrics can be loaded. Public fallback was not used.",
        event_type="instagram_reconnect_required",
    )
    assert all(
        call.kwargs.get("event_type") != "instagram_public_fallback"
        for call in sink.emit.call_args_list
    )


def test_connected_instagram_failure_preserves_graph_error_class() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        state=InstagramConnectionState.USABLE,
        token="opaque-direct-token",
        ig_user_id=123,
        expires_at="2026-09-18T00:00:00+00:00",
        graph_api_family="instagram",
    )
    sink = MagicMock()

    with patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.get_full_metrics",
        side_effect=InstagramAPIError(InstagramErrorKind.AUTH_PERMISSION),
    ), patch("auditlayer_worker.instagram_api.InstagramAPIClient.close"):
        future = _start_instagram_fetch(gateway, _audit(), sink)
        with pytest.raises(InstagramAPIError) as caught:
            future.result(timeout=2)

    assert caught.value.kind == InstagramErrorKind.AUTH_PERMISSION


def test_live_instagram_snapshot_refreshes_connection_health() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        state=InstagramConnectionState.USABLE,
        token="opaque-direct-token",
        ig_user_id=123,
        expires_at="2026-09-18T00:00:00+00:00",
        graph_api_family="instagram",
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
        avg_reach=240.0,
        reach_media_count=2,
        reach_eligible_media_count=3,
    )

    with patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.get_full_metrics",
        return_value=metrics,
    ), patch("auditlayer_worker.instagram_api.InstagramAPIClient.close"), patch(
        "auditlayer_worker.pipeline.capture_worker_failure", create=True
    ) as capture:
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
    api_events = [
        call.args[1]
        for call in sink.emit.call_args_list
        if call.kwargs.get("event_type") == "instagram_api"
    ]
    assert api_events == [
        "Connected Instagram Graph API loaded: 1,110 followers, 0 recent posts, "
        "1.2% average engagement, reach available for 2 of 3 eligible posts."
    ]
    capture.assert_called_once_with(
        capture.call_args.args[0],
        surface="instagram_insights",
        operation="insights_fetch",
        status="degraded",
    )
    assert str(capture.call_args.args[0]) == "Instagram Insights coverage was partial"


def test_live_instagram_event_and_snapshot_keep_missing_counts_unavailable() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        state=InstagramConnectionState.USABLE,
        token="opaque-direct-token",
        ig_user_id=123,
        expires_at="2099-01-01T00:00:00+00:00",
        graph_api_family="instagram",
    )
    sink = MagicMock()
    profile = SimpleNamespace(
        account_type="CREATOR",
        followers_count=None,
        media_count=None,
        fetched_at="2026-07-19T00:00:00+00:00",
    )
    metrics = SimpleNamespace(
        profile=profile,
        recent_media=[],
        avg_engagement_rate=None,
        avg_reach=None,
        reach_media_count=0,
        reach_eligible_media_count=0,
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
        followers_count=None,
        media_count=None,
        observed_at="2026-07-19T00:00:00+00:00",
    )
    sink.emit.assert_any_call(
        "researching",
        "Connected Instagram Graph API loaded: N/A followers, 0 recent posts, "
        "N/A average engagement, reach available for 0 of 0 eligible posts.",
        event_type="instagram_api",
    )


def test_token_refresh_failure_is_captured_and_valid_token_still_loads_metrics() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        state=InstagramConnectionState.USABLE,
        token="opaque-direct-token",
        ig_user_id=123,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        graph_api_family="instagram",
    )
    sink = MagicMock()
    metrics = SimpleNamespace(
        profile=SimpleNamespace(
            account_type="BUSINESS",
            followers_count=100,
            media_count=1,
            fetched_at="2026-07-19T00:00:00+00:00",
        ),
        recent_media=[],
        avg_engagement_rate=1.0,
        avg_reach=None,
        reach_media_count=0,
        reach_eligible_media_count=0,
    )
    refresh_error = RuntimeError("private refresh detail")

    with patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.refresh_long_lived_token",
        side_effect=refresh_error,
    ), patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.get_full_metrics",
        return_value=metrics,
    ), patch("auditlayer_worker.instagram_api.InstagramAPIClient.close"), patch(
        "auditlayer_worker.pipeline.capture_worker_failure", create=True
    ) as capture:
        result = _start_instagram_fetch(gateway, _audit(), sink).result(timeout=2)

    assert result is metrics
    capture.assert_any_call(
        refresh_error,
        surface="instagram_graph",
        operation="token_refresh",
        status="degraded",
    )


def test_snapshot_persistence_failure_is_captured_without_blocking_live_metrics() -> None:
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        state=InstagramConnectionState.USABLE,
        token="opaque-direct-token",
        ig_user_id=123,
        expires_at="2026-09-18T00:00:00+00:00",
        graph_api_family="instagram",
    )
    persist_error = RuntimeError("private persistence detail")
    gateway.refresh_instagram_connection.side_effect = persist_error
    sink = MagicMock()
    metrics = SimpleNamespace(
        profile=SimpleNamespace(
            account_type="CREATOR",
            followers_count=1110,
            media_count=42,
            fetched_at="2026-07-19T00:00:00+00:00",
        ),
        recent_media=[],
        avg_engagement_rate=1.2,
        avg_reach=None,
        reach_media_count=0,
        reach_eligible_media_count=0,
    )

    with patch(
        "auditlayer_worker.instagram_api.InstagramAPIClient.get_full_metrics",
        return_value=metrics,
    ), patch("auditlayer_worker.instagram_api.InstagramAPIClient.close"), patch(
        "auditlayer_worker.pipeline.capture_worker_failure", create=True
    ) as capture:
        result = _start_instagram_fetch(gateway, _audit(), sink).result(timeout=2)

    assert result is metrics
    capture.assert_called_once_with(
        persist_error,
        surface="instagram_connection",
        operation="connection_persist",
        status="degraded",
    )
