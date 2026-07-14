"""Supabase access for the worker (service-role key, bypasses RLS).

Wraps supabase-py for the queue claim, event stream, report/PDF uploads,
billing writes, and app_settings reads. Conforms to the shared data contract:
tables ``audits``, ``audit_events``, ``refinements``, ``app_settings`` and
private storage buckets ``reports`` (text/html) and ``pdfs`` (application/pdf).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .config import WorkerSettings


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class AppSettings:
    hermes_model: str
    hermes_api_base: str | None
    enabled_toolsets: tuple[str, ...]
    token_cap: int
    cost_cap_usd: float


class SupabaseGateway:
    def __init__(self, settings: WorkerSettings):
        if not settings.has_supabase:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        try:
            from supabase import create_client
        except ImportError as exc:  # pragma: no cover - import guidance
            raise RuntimeError(
                "supabase-py is not installed. Install worker deps with `uv sync` in worker/."
            ) from exc
        self.settings = settings
        self.client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # -- app settings ------------------------------------------------------

    def get_app_settings(self) -> AppSettings:
        res = self.client.table("app_settings").select("*").eq("id", 1).limit(1).execute()
        row = (res.data or [{}])[0]
        toolsets = row.get("enabled_toolsets") or list(self.settings.enabled_toolsets)
        if isinstance(toolsets, str):
            toolsets = [t.strip() for t in toolsets.split(",") if t.strip()]
        return AppSettings(
            hermes_model=row.get("hermes_model") or self.settings.hermes_model,
            hermes_api_base=row.get("hermes_api_base") or self.settings.hermes_api_base,
            enabled_toolsets=tuple(toolsets),
            token_cap=int(row.get("token_cap") or self.settings.token_cap),
            cost_cap_usd=float(row.get("cost_cap_usd") or self.settings.cost_cap_usd),
        )

    # -- instagram token ---------------------------------------------------

    def get_instagram_token(self, ig_username: str) -> tuple[str, int] | None:
        res = (
            self.client.table("instagram_connections")
            .select(
                "ig_user_id, long_lived_token, long_lived_expires_at, is_active"
            )
            .eq("ig_username", ig_username)
            .eq("is_active", True)
            .order("created_at", ascending=False)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        row = rows[0]
        token = row.get("long_lived_token")
        if not token:
            return None
        expires = row.get("long_lived_expires_at")
        if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
            return None
        ig_user_id = row.get("ig_user_id")
        if ig_user_id is None:
            return None
        return (str(token), int(ig_user_id))

    # -- RPC claim helpers -------------------------------------------------

    def _claim_via_rpc(self, rpc_name: str) -> dict | None:
        """Try to claim a queued row via the atomic RPC function.

        Calls the named Supabase RPC (``claim_next_queued`` or
        ``claim_next_refinement``) with the worker_id. The RPC uses
        ``SELECT ... FOR UPDATE SKIP LOCKED`` inside a transaction, so
        concurrent workers never contend for the same row.

        Missing or failed RPCs are fatal. Falling back to SELECT-then-UPDATE
        weakens the queue's atomicity exactly when deployment state is uncertain.
        """
        res = self.client.rpc(rpc_name, {"worker_id": self.settings.worker_id}).execute()

        # supabase-py may return the value directly or wrapped in .data
        data = res.data
        if isinstance(data, list) and len(data) == 1:
            data = data[0]
        if isinstance(data, dict) and data:
            return data
        return None

    # -- queue claim -------------------------------------------------------

    def claim_next_queued(self) -> dict | None:
        """Atomically claim the oldest queued audit (status -> running).

        Requires the RPC path (``SELECT ... FOR UPDATE SKIP LOCKED``) so claim
        semantics remain atomic under every deployment state.
        """
        return self._claim_via_rpc("claim_next_queued")

    # -- retry sweep --------------------------------------------------------

    def sweep_retryable(self) -> int:
        from datetime import timedelta

        from .core import MAX_RETRIES, RETRY_BACKOFF_BASE_SECONDS

        TRANSIENT_RETRY_DELAY_SECONDS = 300  # 5 minutes

        try:
            res = (
                self.client.table("audits")
                .select("id,retry_count,last_failed_at")
                .eq("status", "failed")
                .execute()
            )
        except Exception:
            return 0

        re_queued = 0
        now = datetime.now(timezone.utc)
        for row in (res.data or []):
            retry_count = row.get("retry_count") or 0
            if retry_count >= MAX_RETRIES:
                continue
            last_failed = row.get("last_failed_at")
            if last_failed:
                if retry_count < 2:
                    backoff = TRANSIENT_RETRY_DELAY_SECONDS
                else:
                    backoff = min(
                        (2 ** retry_count) * RETRY_BACKOFF_BASE_SECONDS,
                        3600,
                    )
                eligible_at = datetime.fromisoformat(last_failed) + timedelta(seconds=backoff)
                if now < eligible_at:
                    continue
            try:
                self.client.table("audits").update({
                    "status": "queued",
                    "retry_count": retry_count + 1,
                    "updated_at": _utcnow(),
                }).eq("id", row["id"]).eq("status", "failed").execute()
                re_queued += 1
            except Exception:
                pass
        return re_queued

    # -- stale running reaper ------------------------------------------------

    def sweep_stale_running(self, cutoff_minutes: int = 30) -> int:
        res = self.client.rpc(
            "reap_stale_running",
            {"cutoff_minutes": cutoff_minutes},
        ).execute()
        return int(res.data or 0)

    def claim_next_refinement(self) -> dict | None:
        """Atomically claim the oldest queued refinement (status -> running).

        Requires the atomic RPC path.
        """
        return self._claim_via_rpc("claim_next_refinement")

    # -- writes ------------------------------------------------------------

    def update_audit(self, audit_id: str, **fields: Any) -> None:
        fields["updated_at"] = _utcnow()
        self.client.table("audits").update(fields).eq("id", audit_id).execute()

    def update_refinement(self, refinement_id: str, **fields: Any) -> None:
        fields["updated_at"] = _utcnow()
        self.client.table("refinements").update(fields).eq("id", refinement_id).execute()

    def emit_event(
        self,
        audit_id: str,
        phase: str,
        detail: str = "",
        *,
        event_type: str | None = None,
        actor: str = "worker",
    ) -> None:
        self.client.table("audit_events").insert(
            {
                "audit_id": audit_id,
                "actor": actor,
                "event_type": event_type or phase,
                "phase": phase,
                "detail": detail,
                "created_at": _utcnow(),
            }
        ).execute()

    # -- storage -----------------------------------------------------------

    def upload_report(self, audit_id: str, html: str) -> tuple[str, str]:
        path = f"{audit_id}.html"
        return self._upload(self.settings.reports_bucket, path, html.encode("utf-8"), "text/html")

    def upload_pdf(self, audit_id: str, data: bytes) -> tuple[str, str]:
        path = f"{audit_id}.pdf"
        return self._upload(self.settings.pdfs_bucket, path, data, "application/pdf")

    def _upload(self, bucket: str, path: str, data: bytes, content_type: str) -> tuple[str, str]:
        store = self.client.storage.from_(bucket)
        store.upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        signed = store.create_signed_url(path, self.settings.signed_url_ttl_seconds)
        url = signed.get("signedURL") or signed.get("signedUrl") or ""
        return path, url

    # -- benchmark cache ----------------------------------------------------

    def get_cached_benchmarks(self, niches: list[str]) -> list[dict]:
        if not niches:
            return []
        bench_res = (
            self.client.table("wellness_benchmarks")
            .select("*")
            .in_("niche", niches)
            .execute()
        )
        benchmarks = bench_res.data or []
        if not benchmarks:
            return []

        benchmark_ids = [b["id"] for b in benchmarks]
        peer_res = (
            self.client.table("peer_graph")
            .select("*")
            .in_("benchmarks_id", benchmark_ids)
            .execute()
        )
        peers = peer_res.data or []

        peers_by_benchmark: dict[str, list] = {b["id"]: [] for b in benchmarks}
        for p in peers:
            bid = p.get("benchmarks_id")
            if bid in peers_by_benchmark:
                peers_by_benchmark[bid].append(p)

        return [{**b, "peers": peers_by_benchmark.get(b["id"], [])} for b in benchmarks]
