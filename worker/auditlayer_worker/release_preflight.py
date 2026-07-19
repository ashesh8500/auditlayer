"""Non-mutating production preflight for schema and embedded Hermes runtime."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import httpx

from .config import WorkerSettings
from .hermes_embedded import diagnose_embedded

_REQUIRED_RPCS = {
    "claim_next_queued",
    "claim_next_refinement",
    "claim_next_pdf",
    "mark_pdf_attempt_failed",
    "reap_stale_pdf_claims",
    "sweep_retryable_audits",
    "reap_stale_running",
    "get_benchmarks",
    "redeem_trial_link",
    "submit_entitled_audit",
    "admin_set_access",
}
_REQUIRED_SELECTS = {
    "audits": "id,report_type,retry_count,last_failed_at,research_cache,prompt_version,claimed_at,claimed_by",
    "profiles": "id,plan,account_type,gifted_audits,trial_link_id,trial_plan,trial_report_types,trial_expires_at",
    "trial_links": "id,audits_granted,max_uses,used_count,expires_at,offer_plan,report_types,access_days",
    "admin_actions": "id,actor_id,target_user_id,action,detail",
    "wellness_benchmarks": "id,niche,followers_bracket,avg_engagement",
    "peer_graph": "id,handle,niche,benchmarks_id",
}


@dataclass(frozen=True)
class PreflightResult:
    ok: bool
    model: str
    provider: str
    hermes_mode: str
    schema_tables: tuple[str, ...]
    schema_rpcs: tuple[str, ...]
    token_cap: int
    cost_cap_usd: float
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def run_preflight(settings: WorkerSettings) -> PreflightResult:
    """Verify production prerequisites without claiming or changing queue rows."""
    errors: list[str] = []
    tables: list[str] = []
    rpcs: list[str] = []
    token_cap = 0
    cost_cap = 0.0

    if settings.generator != "hermes":
        errors.append("AUDITLAYER_GENERATOR must be hermes")
    if settings.hermes_mode != "inprocess":
        errors.append("HERMES_MODE must be inprocess")
    if settings.hermes_model != "deepseek-v4-flash":
        errors.append("HERMES_MODEL must be deepseek-v4-flash")
    if settings.hermes_provider != "deepseek":
        errors.append("HERMES_PROVIDER must be deepseek")
    if not settings.has_supabase:
        errors.append("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    diagnostic = diagnose_embedded()
    if not diagnostic.ok:
        errors.append(f"embedded Hermes unavailable: {diagnostic.error}")

    if settings.has_supabase:
        assert settings.supabase_url is not None
        headers = {
            "apikey": settings.supabase_service_role_key or "",
            "Authorization": f"Bearer {settings.supabase_service_role_key or ''}",
        }
        base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        with httpx.Client(timeout=20.0, headers=headers) as client:
            try:
                schema_response = client.get(base + "/", headers={**headers, "Accept": "application/openapi+json"})
                schema_response.raise_for_status()
                paths = schema_response.json().get("paths", {})
                available = {path.removeprefix("/rpc/") for path in paths if path.startswith("/rpc/")}
                rpcs = sorted(_REQUIRED_RPCS & available)
                missing = sorted(_REQUIRED_RPCS - available)
                if missing:
                    errors.append(f"missing RPCs: {', '.join(missing)}")
            except Exception as exc:  # noqa: BLE001 - aggregate release evidence
                errors.append(f"OpenAPI probe failed: {exc}")

            for table, columns in _REQUIRED_SELECTS.items():
                try:
                    response = client.get(f"{base}/{table}", params={"select": columns, "limit": "0"})
                    response.raise_for_status()
                    tables.append(table)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{table} schema probe failed: {exc}")

            try:
                response = client.get(
                    f"{base}/app_settings",
                    params={"select": "hermes_model,token_cap,cost_cap_usd", "id": "eq.1"},
                )
                response.raise_for_status()
                rows = response.json()
                if len(rows) != 1:
                    errors.append("app_settings row id=1 is missing")
                else:
                    row = rows[0]
                    token_cap = int(row["token_cap"])
                    cost_cap = float(row["cost_cap_usd"])
                    if row["hermes_model"] != "deepseek-v4-flash":
                        errors.append("app_settings.hermes_model must be deepseek-v4-flash")
                    if token_cap < 120_000:
                        errors.append("app_settings.token_cap must be at least 120000 combined tokens")
                    if cost_cap <= 0:
                        errors.append("app_settings.cost_cap_usd must be positive")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"app_settings probe failed: {exc}")

    return PreflightResult(
        ok=not errors,
        model=settings.hermes_model,
        provider=settings.hermes_provider,
        hermes_mode=settings.hermes_mode,
        schema_tables=tuple(sorted(tables)),
        schema_rpcs=tuple(rpcs),
        token_cap=token_cap,
        cost_cap_usd=cost_cap,
        errors=tuple(errors),
    )
