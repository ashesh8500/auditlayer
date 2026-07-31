"""Disposable production-path report benchmark without customer mutations."""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import statistics
from typing import Any, cast
from uuid import uuid4

from .config import WorkerSettings
from .core import AuditRecord, Goal, Plan
from .hermes_runtime import HermesRuntime
from .pipeline import GenerationPipeline, PrintEventSink
from .supabase_client import SupabaseGateway
from .worker import build_generator


@dataclass(frozen=True)
class BenchmarkCase:
    label: str
    handle: str
    report_type: str
    context: str
    expected_account_type: str
    user_id: str | None = None


DEFAULT_CASES = (
    BenchmarkCase(
        label="personal_creator_standard",
        handle="narinfazla",
        report_type="standard",
        context=(
            "Personal wellness creator and strategist. Evaluate this as a personal "
            "brand: trust, authority, storytelling coherence, audience connection, "
            "and a realistic conversion path."
        ),
        expected_account_type="personal_creator",
    ),
    BenchmarkCase(
        label="wellness_business_standard",
        handle="headspace",
        report_type="standard",
        context=(
            "Consumer wellness business. Evaluate product visibility, brand consistency, "
            "customer trust, conversion architecture, and the content-to-commerce funnel."
        ),
        expected_account_type="business",
    ),
    BenchmarkCase(
        label="b2b_media_business_pulse",
        handle="auditlayermedia",
        report_type="pulse",
        context=(
            "B2B social media intelligence business. Evaluate offer clarity, proof, "
            "brand consistency, qualified demand generation, and conversion readiness."
        ),
        expected_account_type="business",
    ),
)

EXTENDED_CASE = BenchmarkCase(
    label="wellness_business_extended",
    handle="headspace",
    report_type="extended",
    context=(
        "Consumer wellness business. Produce the premium deep-dive while staying dense, "
        "evidence-backed, business-focused, and non-repetitive."
    ),
    expected_account_type="business",
)


def _nearest_rank(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, math.ceil(percentile * len(ordered)))
    return ordered[min(rank - 1, len(ordered) - 1)]


def _connected_company_case(gateway: SupabaseGateway) -> BenchmarkCase | None:
    """Use only AuditLayer's own company connection, never an arbitrary customer."""
    response = (
        gateway.client.table("instagram_connections")
        .select("user_id, ig_username, is_active")
        .eq("ig_username", "auditlayermedia")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    row = cast(dict[str, object], rows[0])
    return BenchmarkCase(
        label="company_connected_instagram_standard",
        handle=str(row["ig_username"]),
        report_type="standard",
        context=(
            "AuditLayer company account. Use the connected first-party Instagram metrics "
            "and evaluate this as a B2B media intelligence business."
        ),
        expected_account_type="connected_business",
        user_id=str(row["user_id"]),
    )


def run_live_benchmark(
    settings: WorkerSettings,
    *,
    repeats: int = 1,
    include_connected: bool = False,
    include_extended: bool = False,
    output_json: Path | None = None,
) -> tuple[dict[str, Any], bool]:
    if repeats < 1 or repeats > 5:
        raise ValueError("repeats must be between 1 and 5")
    if not settings.has_supabase:
        raise RuntimeError("live benchmark requires Supabase service-role configuration")
    if settings.generator != "hermes":
        settings = replace(settings, generator="hermes")

    settings = replace(
        settings,
        alm_accounts_root=str(settings.output_dir / "benchmark-accounts"),
    )

    gateway = SupabaseGateway(settings)
    app_settings = gateway.get_app_settings()
    runtime = HermesRuntime(settings)
    runtime.ensure_ready()
    generator = build_generator(settings, app_settings, runtime=runtime)
    pipeline = GenerationPipeline(settings, generator)

    cases = list(DEFAULT_CASES)
    notes: list[str] = []
    if include_extended:
        cases.append(EXTENDED_CASE)
    if include_connected:
        connected = _connected_company_case(gateway)
        if connected is None:
            notes.append("AuditLayer company Instagram connection was unavailable; connected case skipped.")
        else:
            cases.append(connected)

    started_at = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    try:
        for repeat in range(1, repeats + 1):
            for case in cases:
                audit = AuditRecord(
                    id=str(uuid4()),
                    handle=case.handle,
                    platform="instagram",
                    goal=Goal.GROWTH.value,
                    context=case.context,
                    plan=Plan.ENTERPRISE.value,
                    report_type=case.report_type,
                    user_id=case.user_id,
                    force_refresh=True,
                    milestone_label="10K",
                )
                print(
                    f"\n== benchmark {case.label} repeat {repeat}/{repeats} ==",
                    flush=True,
                )
                summary = pipeline.run(
                    audit,
                    PrintEventSink(),
                    gateway=gateway,
                    enforce_gate=False,
                    token_cap=app_settings.token_cap,
                    cost_cap_usd=app_settings.cost_cap_usd,
                    persist_report=False,
                    run_kind="benchmark",
                )
                result = asdict(summary)
                result.update(
                    {
                        "case": case.label,
                        "handle": case.handle,
                        "expected_account_type": case.expected_account_type,
                        "report_type": case.report_type,
                        "repeat": repeat,
                    }
                )
                results.append(result)
                print(
                    json.dumps(
                        {
                            "case": case.label,
                            "status": summary.status,
                            "seconds": summary.wall_clock_seconds,
                            "tokens": summary.tokens_in + summary.tokens_out,
                            "cost_usd": summary.cost_usd,
                            "quality": summary.quality_score,
                            "account_mode": summary.account_mode,
                            "stages": summary.stage_timings,
                            "report_path": summary.report_path,
                        },
                        sort_keys=True,
                    ),
                    flush=True,
                )
    finally:
        runtime.shutdown()

    latencies = [float(row["wall_clock_seconds"]) for row in results]
    costs = [float(row["cost_usd"]) for row in results]
    tokens = [int(row["tokens_in"]) + int(row["tokens_out"]) for row in results]
    qualities = [int(row["quality_score"] or 0) for row in results]
    ready = [row for row in results if row["status"] == "ready"]

    hard_latency = {
        "pulse": 180.0,
        "standard": 330.0,
        "blueprint": 330.0,
        "extended": 480.0,
        "enterprise": 600.0,
    }
    violations: list[str] = []
    for row in results:
        if row["status"] != "ready":
            violations.append(f"{row['case']} status={row['status']}")
        if int(row["quality_score"] or 0) < 90:
            violations.append(f"{row['case']} quality={row['quality_score']}")
        limit = hard_latency.get(str(row["report_type"]), 330.0)
        if float(row["wall_clock_seconds"]) > limit:
            violations.append(f"{row['case']} latency>{limit:.0f}s")
        if str(row["report_type"]) == "standard" and float(row["cost_usd"]) > 0.50:
            violations.append(f"{row['case']} standard_cost>${0.50:.2f}")
        if str(row["report_type"]) == "standard" and (
            int(row["tokens_in"]) + int(row["tokens_out"])
        ) > 40_000:
            violations.append(f"{row['case']} standard_tokens>40000")

    finished_at = datetime.now(timezone.utc)
    report = {
        "schema_version": "1.0",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "model": app_settings.hermes_model,
        "provider": settings.hermes_provider,
        "repeats": repeats,
        "cases_requested": len(cases),
        "runs": len(results),
        "notes": notes,
        "aggregate": {
            "ready_rate": round(len(ready) / len(results), 4) if results else 0.0,
            "latency_seconds": {
                "p50": round(statistics.median(latencies), 3) if latencies else 0.0,
                "p95": round(_nearest_rank(latencies, 0.95), 3),
                "max": round(max(latencies), 3) if latencies else 0.0,
            },
            "cost_usd": {
                "mean": round(statistics.mean(costs), 6) if costs else 0.0,
                "max": round(max(costs), 6) if costs else 0.0,
                "total": round(sum(costs), 6),
            },
            "tokens": {
                "mean": round(statistics.mean(tokens), 1) if tokens else 0.0,
                "max": max(tokens) if tokens else 0,
                "total": sum(tokens),
            },
            "quality": {
                "mean": round(statistics.mean(qualities), 1) if qualities else 0.0,
                "min": min(qualities) if qualities else 0,
            },
        },
        "violations": violations,
        "passed": bool(results) and not violations,
        "results": results,
    }

    destination = output_json or (
        settings.output_dir
        / f"benchmark-{finished_at.strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    report["output_json"] = str(destination)
    return report, bool(report["passed"])
