"""Supabase access for the worker (service-role key, bypasses RLS).

Wraps supabase-py for the queue claim, event stream, and report uploads,
billing writes, and app_settings reads. Conforms to the shared data contract:
tables ``audits``, ``audit_events``, ``refinements``, ``app_settings`` and
the private ``reports`` Storage bucket, and account progression data.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .config import WorkerSettings


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# Stage-timing whitelist for private report-attempt telemetry. Hoisted to module
# level so the intelligence telemetry-persistence contract can drift-test the
# adapter: report stages are the only keys ``finish_report_generation_run`` may
# persist, and runtime stage keys are never representable here.
ALLOWED_REPORT_STAGE_TIMINGS = frozenset(
    {
        "research",
        "connected_metrics",
        "analysis",
        "validation",
        "format_correction",
        "postprocess",
    }
)


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

    def get_instagram_token(
        self, ig_username: str, user_id: str
    ) -> tuple[str, int, str] | None:
        res = (
            self.client.table("instagram_connections")
            .select(
                "ig_user_id, long_lived_token, long_lived_expires_at, is_active"
            )
            .eq("ig_username", ig_username)
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("created_at", desc=True)
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
        return (str(token), int(ig_user_id), str(expires or ""))

    def update_instagram_token(
        self,
        *,
        user_id: str,
        ig_user_id: int,
        token: str,
        expires_at: str,
    ) -> None:
        """Persist a refreshed direct Instagram Login token."""
        self.client.table("instagram_connections").update(
            {
                "long_lived_token": token,
                "long_lived_expires_at": expires_at,
                "updated_at": _utcnow(),
            }
        ).eq("user_id", user_id).eq("ig_user_id", ig_user_id).execute()

    def refresh_instagram_connection(
        self,
        *,
        user_id: str,
        ig_user_id: int,
        account_type: str,
        followers_count: int,
        media_count: int,
        observed_at: str,
    ) -> None:
        """Make connection health agree with the live snapshot used by an audit."""
        self.client.table("instagram_connections").update(
            {
                "account_type": account_type or None,
                "followers_count": followers_count,
                "media_count": media_count,
                "last_refreshed_at": observed_at,
                "updated_at": _utcnow(),
            }
        ).eq("user_id", user_id).eq("ig_user_id", ig_user_id).eq(
            "is_active", True
        ).execute()

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
        """Atomically requeue eligible failures and block exhausted audits."""
        from .core import MAX_RETRIES, RETRY_BACKOFF_BASE_SECONDS

        try:
            res = self.client.rpc(
                "sweep_retryable_audits",
                {
                    "p_max_retries": MAX_RETRIES,
                    "p_transient_delay_seconds": 60,
                    "p_base_delay_seconds": RETRY_BACKOFF_BASE_SECONDS,
                },
            ).execute()
        except Exception:
            return 0
        data = res.data or {}
        if isinstance(data, list):
            data = data[0] if data else {}
        return int(data.get("requeued", 0)) if isinstance(data, dict) else 0


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

    # -- private report runtime metrics -----------------------------------

    def start_report_generation_run(
        self,
        *,
        audit_id: str | None,
        worker_id: str,
        report_type: str,
        model: str,
        prompt_version: str,
        bundle_version: str | None,
        cache_mode: str,
        run_kind: str = "production",
    ) -> str:
        """Persist a crash-detectable attempt before expensive work starts."""
        run_id = str(uuid4())
        self.client.table("report_generation_runs").insert(
            {
                "id": run_id,
                "audit_id": audit_id,
                "run_kind": run_kind,
                "worker_id": worker_id[:120],
                "report_type": report_type[:40],
                "account_mode": "unknown",
                "cache_mode": cache_mode,
                "status": "running",
                "model": model[:120],
                "prompt_version": prompt_version[:80],
                "bundle_version": bundle_version[:120] if bundle_version else None,
            }
        ).execute()
        return run_id

    def finish_report_generation_run(
        self,
        run_id: str,
        *,
        status: str,
        total_seconds: float,
        stage_timings: dict[str, float] | None = None,
        tokens_in: int = 0,
        tokens_out: int = 0,
        cost_usd: float = 0.0,
        evidence_items: int = 0,
        quality_score: int | None = None,
        format_retry_used: bool = False,
        research_cache_used: bool = False,
        account_mode: str = "unknown",
        error_code: str | None = None,
    ) -> None:
        """Finish an attempt with aggregate, non-customer telemetry only."""
        safe_timings = {
            key: round(max(0.0, float(value)), 3)
            for key, value in (stage_timings or {}).items()
            if key in ALLOWED_REPORT_STAGE_TIMINGS
        }
        fields = {
            "status": status,
            "finished_at": _utcnow(),
            "total_seconds": round(max(0.0, float(total_seconds)), 3),
            "stage_timings": safe_timings,
            "tokens_in": max(0, int(tokens_in)),
            "tokens_out": max(0, int(tokens_out)),
            "cost_usd": round(max(0.0, float(cost_usd)), 6),
            "evidence_items": max(0, int(evidence_items)),
            "quality_score": quality_score,
            "format_retry_used": bool(format_retry_used),
            "research_cache_used": bool(research_cache_used),
            "account_mode": account_mode,
            "error_code": error_code[:120] if error_code else None,
            "updated_at": _utcnow(),
        }
        self.client.table("report_generation_runs").update(fields).eq("id", run_id).execute()

    def sweep_stale_report_generation_runs(self, cutoff_minutes: int = 10) -> int:
        """Mark attempts abandoned by a killed/restarted worker as crashed."""
        response = self.client.rpc(
            "reap_stale_report_generation_runs",
            {"p_cutoff_minutes": cutoff_minutes},
        ).execute()
        value = response.data[0] if isinstance(response.data, list) else response.data
        return int(value or 0)

    # -- storage -----------------------------------------------------------

    def upload_report(
        self, audit_id: str, html: str, *, version: int | None = None
    ) -> tuple[str, str]:
        del version  # Display versions are allocated atomically in Postgres.
        path = f"{audit_id}/revisions/{uuid4().hex}.html"
        return self._upload(self.settings.reports_bucket, path, html.encode("utf-8"), "text/html")

    def finalize_initial_report(
        self,
        *,
        audit_id: str,
        delivery_status: str,
        report_path: str,
        prompt_version: str,
        agent_bundle_version: str,
        template_version: str = "master-skeleton-v1",
        intelligence_run_id: str | None = None,
    ) -> int:
        response = self.client.rpc(
            "finalize_initial_report",
            {
                "p_audit_id": audit_id,
                "p_delivery_status": delivery_status,
                "p_report_path": report_path,
                "p_prompt_version": prompt_version,
                "p_template_version": template_version,
                "p_agent_bundle_version": agent_bundle_version,
                "p_intelligence_run_id": intelligence_run_id,
            },
        ).execute()
        value = response.data[0] if isinstance(response.data, list) else response.data
        return int(value)

    def finalize_regenerated_report(
        self,
        *,
        audit_id: str,
        delivery_status: str,
        report_path: str,
        prompt_version: str,
        agent_bundle_version: str,
        template_version: str = "master-skeleton-v1",
        intelligence_run_id: str | None = None,
    ) -> int:
        response = self.client.rpc(
            "finalize_regenerated_report",
            {
                "p_audit_id": audit_id,
                "p_delivery_status": delivery_status,
                "p_report_path": report_path,
                "p_prompt_version": prompt_version,
                "p_template_version": template_version,
                "p_agent_bundle_version": agent_bundle_version,
                "p_intelligence_run_id": intelligence_run_id,
            },
        ).execute()
        value = response.data[0] if isinstance(response.data, list) else response.data
        return int(value)

    def finalize_refinement_report(
        self,
        *,
        audit_id: str,
        refinement_id: str,
        report_path: str,
        prompt_version: str,
        agent_bundle_version: str,
        changed_section: str | None = None,
        change_summary: str = "",
        template_version: str = "master-skeleton-v1",
        intelligence_run_id: str | None = None,
    ) -> int:
        response = self.client.rpc(
            "finalize_refinement_report",
            {
                "p_audit_id": audit_id,
                "p_refinement_id": refinement_id,
                "p_report_path": report_path,
                "p_prompt_version": prompt_version,
                "p_template_version": template_version,
                "p_agent_bundle_version": agent_bundle_version,
                "p_changed_section": changed_section or "",
                "p_change_summary": change_summary[:500],
                "p_intelligence_run_id": intelligence_run_id,
            },
        ).execute()
        value = response.data[0] if isinstance(response.data, list) else response.data
        return int(value)


    def _upload(self, bucket: str, path: str, data: bytes, content_type: str) -> tuple[str, str]:
        """Upload a private artifact and return its durable path.

        The second tuple item is retained as an empty compatibility value for
        older call sites. Signed URLs are request-scoped and must be created by
        the web proxy when an authorized reader asks for the artifact.
        """
        store = self.client.storage.from_(bucket)
        store.upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "false"},
        )
        return path, ""

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

    # -- ALM intelligence ledger RPCs --------------------------------------

    def create_evidence_snapshot(self, subject_id: str) -> str:
        res = self.client.rpc(
            "create_evidence_snapshot", {"p_subject_id": subject_id}
        ).execute()
        return _rpc_scalar_uuid(res.data, "create_evidence_snapshot")

    def start_intelligence_run(self, **kwargs: Any) -> str:
        """Start a pinned intelligence run. Keyword args match kernel RPC names."""
        payload = {
            "p_subject_id": kwargs["subject_id"],
            "p_brief_version": kwargs["brief_version"],
            "p_evidence_snapshot_id": kwargs["evidence_snapshot_id"],
            "p_methodology_version": kwargs["methodology_version"],
            "p_expertise_pack_version": kwargs["expertise_pack_version"],
            "p_prompt_version": kwargs["prompt_version"],
            "p_model_config_hash": kwargs["model_config_hash"],
            "p_output_schema_version": kwargs.get("output_schema_version", "1.0"),
            "p_batch_id": kwargs.get("batch_id"),
        }
        res = self.client.rpc("start_intelligence_run", payload).execute()
        return _rpc_scalar_uuid(res.data, "start_intelligence_run")

    def set_intelligence_run_progress(
        self,
        run_id: str,
        customer_state: str,
        detail: str | None = None,
    ) -> None:
        self.client.rpc(
            "set_intelligence_run_progress",
            {
                "p_run_id": run_id,
                "p_customer_state": customer_state,
                "p_detail": detail,
            },
        ).execute()

    def intelligence_ledger_writer(self) -> "SupabaseLedgerWriter":
        """Return a LedgerWriter bound to this service-role gateway."""
        return SupabaseLedgerWriter(self)


def _rpc_scalar_uuid(data: Any, rpc_name: str) -> str:
    value = data[0] if isinstance(data, list) and data else data
    if value is None or value == "":
        raise RuntimeError(f"{rpc_name} returned no id")
    return str(value)


class SupabaseLedgerWriter:
    """Service-role LedgerWriter matching kernel RPC names and JSONB shapes."""

    def __init__(self, gateway: SupabaseGateway):
        self._gateway = gateway

    def upsert_evidence(self, items: Sequence[Mapping[str, Any]]) -> Sequence[str]:
        res = self._gateway.client.rpc(
            "upsert_evidence", {"p_items": [dict(item) for item in items]}
        ).execute()
        data = res.data or []
        if isinstance(data, list):
            return [str(item) for item in data if item is not None]
        return [str(data)] if data is not None else []

    def record_scores(self, scores: Sequence[Mapping[str, Any]]) -> None:
        self._gateway.client.rpc(
            "record_scores", {"p_scores": [dict(row) for row in scores]}
        ).execute()

    def record_findings(self, findings: Sequence[Mapping[str, Any]]) -> None:
        self._gateway.client.rpc(
            "record_findings", {"p_findings": [dict(row) for row in findings]}
        ).execute()

    def record_recommendations(
        self, recommendations: Sequence[Mapping[str, Any]]
    ) -> None:
        self._gateway.client.rpc(
            "record_recommendations",
            {"p_recommendations": [dict(row) for row in recommendations]},
        ).execute()

    def create_context_update_proposals(
        self, proposals: Sequence[Mapping[str, Any]]
    ) -> Sequence[str]:
        # Kernel RPC ignores proposal_id; strip client-only keys.
        cleaned = []
        for proposal in proposals:
            row = dict(proposal)
            row.pop("proposal_id", None)
            cleaned.append(row)
        res = self._gateway.client.rpc(
            "create_context_update_proposals", {"p_proposals": cleaned}
        ).execute()
        data = res.data or []
        if isinstance(data, list):
            return [str(item) for item in data if item is not None]
        return [str(data)] if data is not None else []

    def finalize_intelligence_run(self, payload: Mapping[str, Any]) -> None:
        self._gateway.client.rpc(
            "finalize_intelligence_run",
            {
                "p_run_id": payload["p_run_id"],
                "p_status": payload["p_status"],
                "p_latency_ms": payload.get("p_latency_ms"),
                "p_tokens_in": payload.get("p_tokens_in"),
                "p_tokens_out": payload.get("p_tokens_out"),
                "p_cost_usd": payload.get("p_cost_usd"),
                "p_cache_mode": payload.get("p_cache_mode"),
            },
        ).execute()
