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

    # -- queue claim -------------------------------------------------------

    def claim_next_queued(self) -> dict | None:
        """Atomically claim the oldest queued audit (status -> running).

        The conditional update (``.eq('status','queued')``) is row-atomic in
        Postgres, so concurrent workers cannot claim the same audit.
        """
        res = (
            self.client.table("audits")
            .select("*")
            .eq("status", "queued")
            .order("created_at")
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        candidate = rows[0]
        upd = (
            self.client.table("audits")
            .update({"status": "running", "updated_at": _utcnow()})
            .eq("id", candidate["id"])
            .eq("status", "queued")
            .execute()
        )
        if not upd.data:
            return None  # lost the race; try again next poll
        return upd.data[0]

    def claim_next_refinement(self) -> dict | None:
        res = (
            self.client.table("refinements")
            .select("*")
            .eq("status", "queued")
            .order("created_at")
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        candidate = rows[0]
        upd = (
            self.client.table("refinements")
            .update({"status": "running", "updated_at": _utcnow()})
            .eq("id", candidate["id"])
            .eq("status", "queued")
            .execute()
        )
        if not upd.data:
            return None
        return upd.data[0]

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
