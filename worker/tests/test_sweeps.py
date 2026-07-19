"""Test sweep methods: stale running reaper and transient retry.

These tests mock the supabase-py client to verify the business logic
without a live Supabase connection.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.supabase_client import SupabaseGateway


# ── helpers ────────────────────────────────────────────────────────────────


def _settings(**over) -> WorkerSettings:
    from dataclasses import replace

    base = WorkerSettings.from_env()
    values = {
        "supabase_url": "https://test.supabase.co",
        "supabase_service_role_key": "test-service-role-key",
    }
    values.update(over)
    return replace(base, **values)


def _make_gateway(settings: WorkerSettings) -> tuple[SupabaseGateway, MagicMock]:
    with patch("supabase.create_client", return_value=MagicMock()) as mock_create:
        gateway = SupabaseGateway(settings)
        return gateway, mock_create.return_value


def _make_select_builder(mock_client: MagicMock, rows: list[dict]) -> MagicMock:
    """Configure mock_client.table("audits") to return a SELECT builder.

    In supabase-py, chain methods (.select, .eq, .order, .limit) all return
    the same builder object (self), so the mock must return itself from each
    method except .execute() which returns the response.
    """
    builder = MagicMock()
    # Chain methods return self
    builder.select.return_value = builder
    builder.eq.return_value = builder
    builder.order.return_value = builder
    builder.limit.return_value = builder
    # execute() returns the response object with .data
    mock_response = MagicMock()
    mock_response.data = rows
    builder.execute.return_value = mock_response

    # Also handle .in_() for the retryable sweep's benchmark query
    builder.in_.return_value = builder

    mock_client.table.return_value = builder
    return builder


def _build_select_mock(rows: list[dict]) -> MagicMock:
    """Create a mock table builder that handles SELECT chain operations.

    Chain methods (.select, .eq, .order, .limit) all return self.
    .execute() returns the response with .data set to rows.
    """
    sel = MagicMock()
    sel.select.return_value = sel
    sel.eq.return_value = sel
    sel.order.return_value = sel
    sel.limit.return_value = sel
    sel.in_.return_value = sel
    mock_sel_resp = MagicMock()
    mock_sel_resp.data = rows
    sel.execute.return_value = mock_sel_resp
    return sel


def _build_update_mock(succeed: bool = True) -> MagicMock:
    """Create a mock table builder that handles UPDATE chain operations.

    table().update({...}).eq("id",...).eq("status",...).execute()
    """
    upd = MagicMock()
    upd_chain = MagicMock()
    upd.update.return_value = upd_chain
    upd_chain.eq.return_value = upd_chain
    if succeed:
        mock_upd_resp = MagicMock()
        mock_upd_resp.data = [{"updated": True}]
        upd_chain.execute.return_value = mock_upd_resp
    else:
        upd_chain.execute.side_effect = RuntimeError("update failed")
    return upd


def _make_alternating_table(
    mock_client: MagicMock,
    select_rows: list[dict],
    update_results: list[bool],
) -> list[MagicMock]:
    """Configure table() to return SELECT first, then UPDATE builders.

    Each call to table("audits") returns the next builder from the sequence.
    Returns the list of builders for later inspection (e.g. verifying update
    payloads).
    """
    builders: list[MagicMock] = [_build_select_mock(select_rows)]
    for succeed in update_results:
        builders.append(_build_update_mock(succeed))

    mock_client.table.side_effect = builders
    return builders


# ── sweep_stale_running ────────────────────────────────────────────────────


class TestSweepStaleRunning:
    """Test the atomic stale-running reaper RPC integration."""

    def test_reaps_stale_running_audits(self):
        """RPC count is returned and the configured cutoff is forwarded."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)
        mock_client.rpc.return_value.execute.return_value.data = 2

        assert gw.sweep_stale_running(cutoff_minutes=45) == 2
        mock_client.rpc.assert_called_once_with(
            "reap_stale_running", {"cutoff_minutes": 45}
        )
        mock_client.table.assert_not_called()

    def test_empty_rpc_result_is_zero(self):
        settings = _settings()
        gw, mock_client = _make_gateway(settings)
        mock_client.rpc.return_value.execute.return_value.data = None

        assert gw.sweep_stale_running() == 0

    def test_rpc_failure_is_not_downgraded_to_client_side_updates(self):
        settings = _settings()
        gw, mock_client = _make_gateway(settings)
        mock_client.rpc.side_effect = RuntimeError("connection refused")

        with pytest.raises(RuntimeError, match="connection refused"):
            gw.sweep_stale_running()
        mock_client.table.assert_not_called()


# ── sweep_retryable ─────────────────────────────────────────────────────────


@pytest.mark.skip(reason="retry eligibility moved into atomic Postgres RPC")
class TestSweepRetryable:
    """Test the transient retry sweep for failed audits."""

    def test_requeues_failed_with_low_retry_count_after_5min(self):
        """Failed audit with retry_count=0 and last_failed_at >5min ago -> requeued."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        failed_6min_ago = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()

        _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": 0, "last_failed_at": failed_6min_ago}],
            update_results=[True],
        )

        retried = gw.sweep_retryable()
        assert retried == 1

    def test_skips_failed_within_5min_transient_window(self):
        """Failed audit with retry_count=0 but only 2min old -> skip."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        failed_2min_ago = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()

        _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": 0, "last_failed_at": failed_2min_ago}],
            update_results=[],
        )

        retried = gw.sweep_retryable()
        assert retried == 0

    def test_requeues_with_retry_count_1_after_5min(self):
        """retry_count=1 still uses 5min transient window."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        failed_7min_ago = (datetime.now(timezone.utc) - timedelta(minutes=7)).isoformat()

        _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": 1, "last_failed_at": failed_7min_ago}],
            update_results=[True],
        )

        retried = gw.sweep_retryable()
        assert retried == 1

    def test_skips_when_retry_count_exceeds_max(self):
        """retry_count >= MAX_RETRIES -> permanently dead, skip."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        from auditlayer_worker.core import MAX_RETRIES

        failed_long_ago = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

        _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": MAX_RETRIES, "last_failed_at": failed_long_ago}],
            update_results=[],
        )

        retried = gw.sweep_retryable()
        assert retried == 0

    def test_handles_missing_last_failed_at(self):
        """If last_failed_at is None, treat as eligible immediately."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": 0, "last_failed_at": None}],
            update_results=[True],
        )

        retried = gw.sweep_retryable()
        assert retried == 1

    def test_handles_empty_failed_queue(self):
        """No failed audits -> no retries."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        _make_alternating_table(mock_client, select_rows=[], update_results=[])

        retried = gw.sweep_retryable()
        assert retried == 0

    def test_handles_select_exception(self):
        """API errors on SELECT should return 0 (non-fatal)."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_client.table.side_effect = RuntimeError("connection refused")

        retried = gw.sweep_retryable()
        assert retried == 0

    def test_update_exception_does_not_crash(self):
        """If one UPDATE fails, sweep should continue."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        failed_10min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

        _make_alternating_table(
            mock_client,
            select_rows=[
                {"id": "a1", "retry_count": 0, "last_failed_at": failed_10min_ago},
                {"id": "a2", "retry_count": 0, "last_failed_at": failed_10min_ago},
            ],
            update_results=[False, True],  # first fails, second succeeds
        )

        retried = gw.sweep_retryable()
        assert retried == 1

    def test_increments_retry_count_on_requeue(self):
        """When requeuing, retry_count should be set to retry_count + 1."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        failed_10min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

        builders = _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": 0, "last_failed_at": failed_10min_ago}],
            update_results=[True],
        )

        retried = gw.sweep_retryable()
        assert retried == 1

        # Verify update payload had retry_count = 1
        # builders[1] is the UPDATE builder — .update() is called on it
        update_builder = builders[1]
        update_builder.update.assert_called_once()
        update_payload = update_builder.update.call_args[0][0]
        assert update_payload["retry_count"] == 1
        assert update_payload["status"] == "queued"

    def test_exponential_backoff_for_higher_retry_count(self):
        """retry_count >= 2 should use exponential backoff, not 5min."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        # retry_count=2: backoff = 2^2 * 60 = 240s = 4min
        # last_failed 3 min ago -> should still be within backoff window -> skip
        failed_3min_ago = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()

        _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": 2, "last_failed_at": failed_3min_ago}],
            update_results=[],
        )

        retried = gw.sweep_retryable()
        assert retried == 0

    def test_exponential_backoff_expired_for_higher_retry_count(self):
        """retry_count=2, last_failed > 4min -> requeue."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        failed_6min_ago = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()

        _make_alternating_table(
            mock_client,
            select_rows=[{"id": "a1", "retry_count": 2, "last_failed_at": failed_6min_ago}],
            update_results=[True],
        )

        retried = gw.sweep_retryable()
        assert retried == 1
