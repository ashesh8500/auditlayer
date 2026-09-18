from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest

from auditlayer_worker.pipeline import _link_account_and_progression
from auditlayer_worker.supabase_client import SupabaseGateway
from concurrent.futures import Future


def test_retry_sweep_propagates_transport_failure():
    gateway = object.__new__(SupabaseGateway)
    gateway.client = MagicMock()
    error = httpx.ReadError('disconnected')
    gateway.client.rpc.return_value.execute.side_effect = error
    with pytest.raises(httpx.ReadError) as caught:
        gateway.sweep_retryable()
    assert caught.value is error


def test_metrics_without_credential_fence_cannot_write_caches():
    gateway = SimpleNamespace(client=MagicMock())
    _link_account_and_progression(gateway, SimpleNamespace(id='a', user_id='u', handle='h', platform='instagram'), SimpleNamespace(profile=None))
    gateway.client.table.assert_not_called()
    gateway.client.rpc.assert_not_called()


def test_connected_checkpoint_never_uses_unfenced_audit_update():
    from auditlayer_worker.pipeline import _checkpoint_cache
    future = Future()
    future.set_result(SimpleNamespace(_credential_fence=("connection", "version")))
    gateway = MagicMock()
    audit = SimpleNamespace(id="audit", user_id="owner")
    assert _checkpoint_cache(gateway, audit, future, "private research") == {}
    gateway.client.rpc.assert_called_once_with("write_instagram_worker_state", {
        "p_user_id": "owner", "p_connection_id": "connection",
        "p_credential_version": "version", "p_action": "cache",
        "p_payload": {"audit_id": "audit", "research_cache": "private research"},
    })


@pytest.mark.parametrize("state", ["pending", "failed", "unfenced"])
def test_checkpoint_uncertainty_never_falls_back_to_table_write(state):
    from auditlayer_worker.pipeline import _checkpoint_cache
    future = Future()
    if state == "failed":
        future.set_exception(RuntimeError("disconnected"))
    elif state == "unfenced":
        future.set_result(SimpleNamespace())
    gateway = MagicMock()
    assert _checkpoint_cache(gateway, SimpleNamespace(id="a"), future, "private") == {}
    gateway.client.table.assert_not_called()
    gateway.client.rpc.assert_not_called()


def test_checkpoint_public_research_keeps_existing_path():
    from auditlayer_worker.pipeline import _checkpoint_cache
    future = Future()
    future.set_result(None)
    assert _checkpoint_cache(None, None, future, "public") == {"research_cache": "public"}


@pytest.mark.parametrize("connection,version", [(None, "v"), ("c", None)])
def test_gateway_missing_fence_never_falls_back(connection, version):
    gateway = object.__new__(SupabaseGateway)
    gateway.client = MagicMock()
    assert gateway.write_instagram_worker_state(
        user_id="owner", connection_id=connection, credential_version=version,
        action="snapshot", payload={},
    ) is None
    gateway.client.table.assert_not_called()
    gateway.client.rpc.assert_not_called()




def test_token_refresh_carries_returned_version_into_snapshot_and_metrics():
    from datetime import datetime, timedelta, timezone
    from unittest.mock import patch
    from auditlayer_worker.pipeline import _start_instagram_fetch
    from auditlayer_worker.supabase_client import InstagramConnectionLookup, InstagramConnectionState
    gateway = MagicMock()
    gateway.get_instagram_token.return_value = InstagramConnectionLookup(
        state=InstagramConnectionState.USABLE, connection_id="connection",
        credential_version="before", token="fixture", ig_user_id=123,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        graph_api_family="instagram",
    )
    gateway.update_instagram_token.return_value = "after"
    metrics = SimpleNamespace(
        profile=SimpleNamespace(account_type="BUSINESS", followers_count=10,
                                media_count=0, fetched_at="2026-01-01T00:00:00Z"),
        avg_engagement_rate=None, recent_media=[],
    )
    with patch("auditlayer_worker.instagram_api.InstagramAPIClient") as client:
        client.return_value.refresh_long_lived_token.return_value = ("refreshed", 3600)
        client.return_value.get_full_metrics.return_value = metrics
        result = _start_instagram_fetch(
            gateway, SimpleNamespace(id="audit", user_id="owner", handle="h"), MagicMock(),
        ).result(timeout=2)
    assert gateway.update_instagram_token.call_args.kwargs["credential_version"] == "before"
    assert gateway.refresh_instagram_connection.call_args.kwargs["credential_version"] == "after"
    assert result._credential_fence == ("connection", "after")
