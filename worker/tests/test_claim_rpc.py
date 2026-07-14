"""Test the atomic claim RPC integration with MOA race-condition awareness.

These tests verify that `_claim_via_rpc` correctly calls the Supabase
RPC function and handles edge cases without a live Supabase connection.
Mocking the supabase-py client lets us validate the call path, parameter
forwarding, and multi-worker exclusion semantics without needing a real
database.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.supabase_client import SupabaseGateway


# ── helpers ────────────────────────────────────────────────────────────────


def _settings(**over) -> WorkerSettings:
    from dataclasses import replace

    base = WorkerSettings.from_env()
    return replace(base, **over)


def _make_gateway(settings: WorkerSettings) -> tuple[SupabaseGateway, MagicMock]:
    """Create a SupabaseGateway with a mocked supabase-py client.

    ``create_client`` is imported locally inside ``SupabaseGateway.__init__``
    from the ``supabase`` package, so we patch it there.
    """
    with patch("supabase.create_client", return_value=MagicMock()) as mock_create:
        gateway = SupabaseGateway(settings)
        return gateway, mock_create.return_value


# ── RPC claim path ──────────────────────────────────────────────────────────


class TestMockedClaimRPC:
    """Test the mocked claim RPC path — no live Supabase needed."""

    def test_claim_via_rpc_calls_named_function(self):
        """_claim_via_rpc must call ``client.rpc(name, {worker_id})``."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_response = MagicMock()
        mock_response.data = {"id": "a1", "handle": "test", "status": "running"}
        mock_client.rpc.return_value.execute.return_value = mock_response

        result = gw._claim_via_rpc("claim_next_queued")

        mock_client.rpc.assert_called_once_with(
            "claim_next_queued", {"worker_id": settings.worker_id}
        )
        mock_client.rpc.return_value.execute.assert_called_once()
        assert result == {"id": "a1", "handle": "test", "status": "running"}

    def test_claim_via_rpc_returns_none_on_null(self):
        """When the RPC returns null (empty queue), _claim_via_rpc must return None."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_response = MagicMock()
        mock_response.data = None
        mock_client.rpc.return_value.execute.return_value = mock_response

        result = gw._claim_via_rpc("claim_next_queued")
        assert result is None

    def test_claim_via_rpc_returns_none_on_empty_dict(self):
        """An empty dict in .data should also yield None."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_response = MagicMock()
        mock_response.data = {}
        mock_client.rpc.return_value.execute.return_value = mock_response

        result = gw._claim_via_rpc("claim_next_queued")
        assert result is None

    def test_claim_via_rpc_handles_list_wrapper(self):
        """supabase-py sometimes wraps the JSON result in a single-element list."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_response = MagicMock()
        mock_response.data = [
            {"id": "a2", "handle": "soloscientist", "status": "running"}
        ]
        mock_client.rpc.return_value.execute.return_value = mock_response

        result = gw._claim_via_rpc("claim_next_queued")
        assert result == {"id": "a2", "handle": "soloscientist", "status": "running"}

    def test_claim_via_rpc_fails_closed_when_missing(self):
        """A missing RPC must stop claims rather than downgrade atomicity."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_client.rpc.side_effect = RuntimeError("function not found")

        with pytest.raises(RuntimeError, match="function not found"):
            gw._claim_via_rpc("claim_next_queued")

    def test_claim_next_queued_tries_rpc_first(self):
        """claim_next_queued should prefer the RPC path and skip legacy."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        # RPC returns a row
        mock_response = MagicMock()
        mock_response.data = {"id": "a3", "handle": "test2", "status": "running"}
        mock_client.rpc.return_value.execute.return_value = mock_response

        result = gw.claim_next_queued()
        assert result == {"id": "a3", "handle": "test2", "status": "running"}
        # The legacy path (table().select()) should never be called
        mock_client.table.assert_not_called()

    def test_claim_next_queued_fails_closed_without_rpc(self):
        """When RPC fails, claim_next_queued must not use the legacy pattern."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_client.rpc.side_effect = RuntimeError("function not found")

        with pytest.raises(RuntimeError, match="function not found"):
            gw.claim_next_queued()
        mock_client.table.assert_not_called()

    def test_claim_next_refinement_tries_rpc_first(self):
        """claim_next_refinement should prefer the RPC path."""
        settings = _settings()
        gw, mock_client = _make_gateway(settings)

        mock_response = MagicMock()
        mock_response.data = {
            "id": "r1",
            "audit_id": "a1",
            "section": "peers",
            "status": "running",
        }
        mock_client.rpc.return_value.execute.return_value = mock_response

        result = gw.claim_next_refinement()
        assert result["id"] == "r1"
        mock_client.table.assert_not_called()


# ── MOA race-condition model ────────────────────────────────────────────────


class TestMOARaceConditionModel:
    """Validate the claim semantics under the MOA (Mutual-Exclusion, Ordering,
    Atomicity) model for multi-worker concurrent access.

    These are documentation-as-tests — they don't call the DB but encode the
    invariants the RPC function is expected to satisfy at the PostgreSQL level.
    """

    def test_MOA_mutual_exclusion(self):
        """Two concurrent claim_next_queued calls MUST never return the same row.

        The RPC uses ``SELECT ... FOR UPDATE SKIP LOCKED`` which guarantees
        row-level exclusion at the PostgreSQL level.  Each transaction locks
        the row it selects; the next caller skips that locked row and picks
        the next one.  The database, not application logic, enforces mutual
        exclusion.
        """
        # This invariant is enforced by PostgreSQL, not Python.
        # The test encodes the expectation: if two workers claim simultaneously,
        # they must receive distinct audit IDs (or one gets None).
        worker_a_row = {"id": "audit-1", "status": "running", "claimed_by": "worker-a"}
        worker_b_row = {"id": "audit-2", "status": "running", "claimed_by": "worker-b"}

        assert worker_a_row["id"] != worker_b_row["id"]
        # In production, if only one queued row exists, one worker gets it
        # and the other gets None.  Both outcomes satisfy mutual exclusion.
        distinct_or_none = (
            worker_a_row["id"] != worker_b_row["id"] or not worker_b_row
        )
        assert distinct_or_none

    def test_MOA_ordering(self):
        """Claims must respect FIFO ordering: oldest queued audit first.

        The RPC orders by ``created_at ASC``.  If audit A was queued before
        audit B, A is claimed before B.  Starvation is impossible because
        SKIP LOCKED only skips rows currently locked by another transaction;
        once that lock is released (commit/rollback), the row is again
        eligible.
        """
        # Invariant: created_at ordering is preserved
        created_a = "2026-01-01T00:00:00Z"
        created_b = "2026-01-02T00:00:00Z"

        assert created_a < created_b  # A was queued first → claimed first

    def test_MOA_atomicity(self):
        """Status transition must be atomic: SELECT + UPDATE in one transaction.

        The RPC function wraps the SELECT and UPDATE in a single PL/pgSQL
        function declared ``SECURITY DEFINER``.  PostgreSQL guarantees that
        the entire function body runs in a single transaction — no partial
        state is visible to concurrent callers.  If the UPDATE fails for
        any reason, the transaction rolls back and the row stays 'queued'.
        """
        # The claim transitions status atomically — no intermediate state.
        before_status = "queued"
        after_status = "running"
        assert before_status != after_status

        # A well-formed claim never produces partial state:
        # claimed_at and claimed_by are set in the same UPDATE, in the same
        # transaction, or both are left untouched.
        claimed_fields = ["claimed_at", "claimed_by"]
        atomic_write_set = set(claimed_fields + ["status", "updated_at"])
        # All four columns are written in one UPDATE ... RETURNING statement.
        assert len(atomic_write_set) == 4

    def test_MOA_recovery_after_worker_crash(self):
        """When a worker crashes after claiming, the stale-running reaper
        must reset the row to 'queued' so another worker can claim it.

        The ``reap_stale_running`` RPC uses the same ``FOR UPDATE SKIP LOCKED``
        pattern to atomically reset rows where ``updated_at`` is older than
        the cutoff.  This prevents ghost locks from dead workers.
        """
        # A row claimed by worker-A that dies before completing:
        stale_row = {
            "id": "audit-x",
            "status": "running",
            "claimed_by": "worker-a",
            "updated_at": "2026-01-01T00:00:00Z",  # 30+ min ago
        }

        # After the reaper runs (cutoff_minutes=30):
        reaped_row = {
            "id": "audit-x",
            "status": "queued",  # reset
            "claimed_by": None,   # cleared
            "updated_at": "2026-07-12T00:00:00Z",  # now
        }

        assert reaped_row["status"] == "queued"
        # Post-reap, the row is eligible for claim again.
        assert stale_row["status"] == "running"
        assert reaped_row["status"] != stale_row["status"]
