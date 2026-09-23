"""Non-mutating production preflight for schema and embedded Hermes runtime."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

import httpx

from .config import WorkerSettings
from .hermes_embedded import diagnose_embedded

# Parameter names verified against the current additive migrations.
_REQUIRED_RPC_ARGUMENTS = {
    "pause_worker_claims": ('p_drain_token',),
    "resume_worker_claims": ('p_drain_token',),
    "worker_drain_status": (),
    'enqueue_report_refinement': ('p_audit_id', 'p_user_id', 'p_report_version', 'p_section', 'p_instruction'),
    "admin_assign_access_delta": (
        "p_actor_id",
        "p_target_user_id",
        "p_plan",
        "p_account_type",
        "p_gifted_delta",
        "p_reason",
    ),
    "admin_finalize_manual_report": ('p_actor_id', 'p_audit_id', 'p_report_path'),
    "admin_set_access": (
        "p_actor_id",
        "p_target_user_id",
        "p_plan",
        "p_account_type",
        "p_gifted_audits",
        "p_reason",
    ),
    "claim_next_queued": ('worker_id',),
    "claim_next_refinement": ('worker_id',),
    "finalize_initial_report": (
        "p_audit_id",
        "p_delivery_status",
        "p_report_path",
        "p_prompt_version",
        "p_template_version",
        "p_agent_bundle_version",
        "p_intelligence_run_id",
    ),
    "finalize_refinement_report": (
        "p_audit_id",
        "p_refinement_id",
        "p_report_path",
        "p_prompt_version",
        "p_template_version",
        "p_agent_bundle_version",
        "p_changed_section",
        "p_change_summary",
        "p_intelligence_run_id",
    ),
    "finalize_regenerated_report": (
        "p_audit_id",
        "p_delivery_status",
        "p_report_path",
        "p_prompt_version",
        "p_template_version",
        "p_agent_bundle_version",
        "p_intelligence_run_id",
    ),
    "get_benchmarks": ('p_niche', 'p_bracket'),
    "reap_stale_report_generation_runs": ('p_cutoff_minutes',),
    "reap_stale_running": ('cutoff_minutes',),
    "redeem_trial_link": ('p_token', 'p_user_id'),
    "submit_entitled_audit": (
        "p_user_id",
        "p_handle",
        "p_platform",
        "p_goal",
        "p_report_type",
        "p_context",
        "p_status",
        "p_limitations",
        "p_milestone_label",
    ),
    "submit_entitled_audit_batch": ('p_user_id', 'p_subject_id', 'p_idempotency_key', 'p_audits'),
    "sweep_retryable_audits": (
        "p_max_retries",
        "p_transient_delay_seconds",
        "p_base_delay_seconds",
    ),
    "sweep_stale_refinements": (),
    "write_instagram_worker_state": (
        "p_user_id",
        "p_connection_id",
        "p_credential_version",
        "p_action",
        "p_payload",
    ),
}
_REQUIRED_RPCS = set(_REQUIRED_RPC_ARGUMENTS)
_REQUIRED_SELECTS = {
    "audit_report_versions": "id,audit_id,version,report_path,source_refinement_id,intelligence_run_id",
    "refinements": "id,audit_id,status,claimed_at,claimed_by,base_report_version,lease_expires_at,usage_status",
    "instagram_connections": "id,user_id,credential_version",
    "audits": "id,report_type,retry_count,last_failed_at,research_cache,prompt_version,claimed_at,claimed_by,report_path,report_version",
    "profiles": "id,plan,account_type,gifted_audits,trial_link_id,trial_plan,trial_report_types,trial_expires_at",
    "trial_links": "id,audits_granted,max_uses,used_count,expires_at,offer_plan,report_types,access_days",
    "admin_actions": "id,actor_id,target_user_id,action,detail",
    "wellness_benchmarks": "id,niche,followers_bracket,avg_engagement",
    "peer_graph": "id,handle,niche,benchmarks_id",
    "report_generation_runs": "id,audit_id,run_kind,report_type,account_mode,cache_mode,status,total_seconds,stage_timings,tokens_in,tokens_out,cost_usd,quality_score,error_code",
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
    provider_key_metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _rpc_signature_errors(schema: dict[str, Any]) -> list[str]:
    """Read OpenAPI only; never invoke mutating RPCs as capability probes."""
    errors = []
    paths = schema.get("paths", {})
    for name, expected in _REQUIRED_RPC_ARGUMENTS.items():
        operation = paths.get(f"/rpc/{name}", {}).get("post")
        if operation is None:
            errors.append(f"missing RPC signature: {name}")
            continue
        body = next((p.get("schema", {}) for p in operation.get("parameters", []) if p.get("in") == "body"), {})
        ref = body.get("$ref", "")
        if ref.startswith("#/definitions/"):
            body = schema.get("definitions", {}).get(ref.removeprefix("#/definitions/"), {})
        actual = set(body.get("properties", {}))
        if actual != set(expected):
            errors.append(f"RPC signature mismatch: {name}: expected {sorted(expected)}, found {sorted(actual)}")
    return errors


def run_preflight(settings: WorkerSettings) -> PreflightResult:
    """Verify production prerequisites without claiming or changing queue rows."""
    errors: list[str] = []
    tables: list[str] = []
    rpcs: list[str] = []
    token_cap = 0
    cost_cap = 0.0
    key_metadata: dict[str, Any] = {}

    if settings.generator != "hermes":
        errors.append("AUDITLAYER_GENERATOR must be hermes")
    if settings.hermes_mode != "inprocess":
        errors.append("HERMES_MODE must be inprocess")
    from .openrouter import MODEL
    import os
    if settings.hermes_provider == "openrouter":
        if settings.hermes_model != MODEL:
            errors.append("ALM_INFERENCE_MODEL must be " + MODEL)
        if not os.environ.get("ALM_OPENROUTER_API_KEY"):
            errors.append("ALM_OPENROUTER_API_KEY is required")
        else:
            from .openrouter import inspect_key_policy
            try:
                key_metadata, key_errors = inspect_key_policy(os.environ["ALM_OPENROUTER_API_KEY"])
                errors.extend(key_errors)
            except Exception as exc:
                errors.append("OpenRouter key metadata probe failed: " + type(exc).__name__)
    else:
        if settings.hermes_model != "deepseek-v4-flash":
            errors.append("HERMES_MODEL must be deepseek-v4-flash")
        if settings.hermes_provider != "deepseek":
            errors.append("HERMES_PROVIDER must be deepseek or openrouter")
    if settings.hermes_max_iterations > 3:
        errors.append("HERMES_MAX_ITERATIONS must be at most 3")
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
                schema = schema_response.json()
                errors.extend(_rpc_signature_errors(schema))
                paths = schema.get("paths", {})
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
                    if settings.hermes_provider != "openrouter" and row["hermes_model"] != "deepseek-v4-flash":
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
        provider_key_metadata=key_metadata,
    )
