"""CLI entrypoint.

    python -m auditlayer_worker run                 # queue worker loop (needs Supabase)
    python -m auditlayer_worker demo --handle ...    # standalone demo (no Supabase)
    python -m auditlayer_worker diagnose-hermes
    python -m auditlayer_worker validate-hermes
    python -m auditlayer_worker regen-pdf --audit-id <uuid>
"""

from __future__ import annotations

import argparse
from dataclasses import replace
import json
import sys
import time
from uuid import uuid4

from .config import WorkerSettings
from .core import (
    AuditRecord,
    Goal,
    Plan,
    Platform,
    evaluate_intake,
    normalize_handle,
)
from .generation import MockReportGenerator
from .hermes import diagnose_hermes, validate_hermes
from .hermes_runtime import HermesRuntime
from .pdf import render_pdf
from .pdf_worker import run_pdf_worker
from .pipeline import GenerationPipeline, PrintEventSink
from .release_preflight import run_preflight
from .supabase_client import SupabaseGateway
from .worker import build_generator, run_worker_loop


def _runtime_from_settings(settings: WorkerSettings) -> HermesRuntime:
    return HermesRuntime(settings)


def cmd_diagnose(settings: WorkerSettings) -> int:
    runtime = _runtime_from_settings(settings)
    print("== Hermes diagnostics ==")
    print(f"hermes_mode        : {runtime.mode}")

    if runtime.mode == "inprocess":
        try:
            runtime.ensure_ready()
            print(f"agent_root         : {runtime.settings.hermes_agent_root or '~/.hermes/hermes-agent'}")
            print("ok                 : True (in-process AIAgent import path verified)")
            return 0
        except FileNotFoundError as exc:
            print(f"ok                 : False")
            print(f"error              : {exc}")
            print(
                "recommendation     : Install Hermes Agent or set HERMES_AGENT_ROOT to the "
                "hermes-agent checkout, then rerun diagnose-hermes."
            )
            return 1

    runtime.ensure_ready()
    result = diagnose_hermes(runtime.build_client(), settings.hermes_model)
    print(f"endpoint           : {result.endpoint}")
    print(f"tcp_reachable      : {result.tcp_reachable} ({result.host}:{result.port})")
    print(f"auth_ok            : {result.auth_ok} (status={result.auth_status_code})")
    print(f"gateway_state      : {result.gateway_state}")
    print(f"api_server_state   : {result.api_server_state}")
    print(f"ok                 : {result.ok}")
    if result.error:
        print(f"error              : {result.error}")
    if result.recommendation:
        print(f"recommendation     : {result.recommendation}")
    return 0 if result.ok else 1


def cmd_validate(settings: WorkerSettings) -> int:
    runtime = _runtime_from_settings(settings)
    runtime.ensure_ready()
    result = validate_hermes(runtime.build_client(), settings.hermes_model)
    print("== Hermes validation ==")
    print(f"ok        : {result.ok}")
    print(f"endpoint  : {result.endpoint}")
    print(f"model     : {result.model}")
    print(f"latency   : {result.latency_ms} ms")
    if result.error:
        print(f"error     : {result.error}")
    return 0 if result.ok else 1


def cmd_regen_pdf(settings: WorkerSettings, audit_id: str) -> int:
    if not settings.has_supabase:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for `regen-pdf`.", file=sys.stderr)
        return 2

    gateway = SupabaseGateway(settings)
    res = gateway.client.table("audits").select("*").eq("id", audit_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        print(f"ERROR: audit {audit_id} not found", file=sys.stderr)
        return 1

    row = rows[0]
    report_path = row.get("report_path")
    if not report_path:
        print("ERROR: audit has no report_path — generate the HTML report first.", file=sys.stderr)
        return 1

    data = gateway.client.storage.from_(settings.reports_bucket).download(report_path)
    html = data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else str(data)

    pdf_result = render_pdf(html, mode=settings.pdf_mode, chromium_path=settings.chromium_path)
    pdf_path, _ = gateway.upload_pdf(audit_id, pdf_result.data)
    gateway.update_audit(audit_id, pdf_path=pdf_path, pdf_status="ready")
    gateway.emit_event(
        audit_id,
        "uploaded",
        f"PDF regenerated ({pdf_result.mode}, {len(pdf_result.data)} bytes)",
        event_type="pdf_regenerated",
    )

    print("== PDF regeneration ==")
    print(f"audit_id   : {audit_id}")
    print(f"pdf_mode   : {pdf_result.mode}")
    print(f"pdf_bytes  : {len(pdf_result.data)}")
    print(f"pdf_path   : {pdf_path}")
    if pdf_result.note:
        print(f"note       : {pdf_result.note}")
    return 0 if pdf_result.mode == "browser" else 1


def cmd_run(settings: WorkerSettings, once: bool) -> int:
    if not settings.has_supabase:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for `run`.", file=sys.stderr)
        print("Use `python -m auditlayer_worker demo` to verify generation without Supabase.", file=sys.stderr)
        return 2
    run_worker_loop(settings, once=once)
    return 0


def cmd_run_pdf(settings: WorkerSettings, once: bool) -> int:
    if not settings.has_supabase:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for `run-pdf`.",
            file=sys.stderr,
        )
        return 2
    run_pdf_worker(settings, once=once)
    return 0


def cmd_demo(settings: WorkerSettings, args: argparse.Namespace) -> int:
    goal = args.goal
    context = args.context or ""

    # Detect platform from the RAW handle (keeps the leading @ / URL signal),
    # then normalize for the stored handle.
    decision = evaluate_intake(
        handle=args.handle,
        goal=goal,
        context=context,
        plan=Plan.FREE,
        platform=Platform(args.platform) if args.platform else Platform.UNKNOWN,
    )
    handle = normalize_handle(args.handle)
    audit = AuditRecord(
        id=f"demo-{handle or 'subject'}-{uuid4().hex[:8]}",
        handle=handle,
        platform=decision.platform.value,
        goal=goal,
        context=context,
        status=decision.status.value,
        limitations=list(decision.limitations),
        milestone_label=decision.milestone_label,
    )

    print("== AuditLayer standalone demo ==")
    print(f"subject     : @{audit.handle}")
    print(f"platform    : {audit.platform}")
    print(f"goal        : {audit.goal}")
    print(f"context     : {audit.context or '(none)'}")
    print(f"intake gate : {audit.status}")
    print(f"milestone   : {audit.milestone_label}")
    for lim in audit.limitations:
        print(f"  limitation: {lim}")
    print()

    # Choose generator. Default tries Hermes; falls back to mock on failure
    # unless --require-hermes is set or --generator mock is forced.
    forced = args.generator or settings.generator
    use_settings = replace(settings, generator=forced)

    runtime = _runtime_from_settings(settings)
    if forced == "hermes":
        runtime.ensure_ready()
        diag = diagnose_hermes(runtime.build_client(), settings.hermes_model)
        print(f"[demo] Hermes reachable={diag.ok} (api_server_state={diag.api_server_state})")
        if not diag.ok:
            print(f"[demo] blocker: {diag.error}")
            print(f"[demo] fix    : {diag.recommendation}")
            if args.require_hermes:
                print("[demo] --require-hermes set; aborting without fallback.", file=sys.stderr)
                return 1
            print("[demo] falling back to deterministic mock generation.\n")
            use_settings = replace(settings, generator="mock")

    generator = build_generator(use_settings, runtime=runtime)
    if isinstance(generator, MockReportGenerator) and use_settings.phase_interval_seconds == 0:
        # Give the demo a visible, paced event stream.
        generator = MockReportGenerator(phase_interval=0.25)

    pipeline = GenerationPipeline(use_settings, generator)
    sink = PrintEventSink()
    print("[demo] event stream:")
    start = time.time()
    summary = pipeline.run(audit, sink, gateway=None, enforce_gate=not args.skip_gate)
    wall = time.time() - start

    print()
    print("== Result ==")
    print(f"status           : {summary.status}")
    print(f"generator/model  : {summary.model}")
    print(f"wall_clock       : {wall:.1f} s")
    print(f"tokens_in        : {summary.tokens_in}{' (est)' if summary.estimated_tokens else ''}")
    print(f"tokens_out       : {summary.tokens_out}{' (est)' if summary.estimated_tokens else ''}")
    print(f"est_cost_usd     : ${summary.cost_usd:.4f}")
    if summary.report_path:
        print(f"html             : {summary.report_path}")
    if summary.pdf_url:
        print(f"pdf ({summary.pdf_mode}): {summary.pdf_url}")
    if summary.note:
        print(f"note             : {summary.note}")
    return 0 if summary.status == "ready" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="auditlayer_worker", description="AuditLayer Hermes worker")
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="Run the Supabase-backed queue worker loop")
    run_p.add_argument("--once", action="store_true", help="Drain one item and exit")

    pdf_p = sub.add_parser("run-pdf", help="Run the asynchronous PDF queue worker")
    pdf_p.add_argument("--once", action="store_true", help="Drain one PDF item and exit")

    demo_p = sub.add_parser("demo", help="Run a standalone generation (no Supabase)")
    demo_p.add_argument("--handle", required=True, help="Handle or profile URL")
    demo_p.add_argument("--goal", default=Goal.GROWTH.value, choices=[g.value for g in Goal])
    demo_p.add_argument("--context", default="", help="Client-supplied context (credentials etc.)")
    demo_p.add_argument("--platform", default="", help="Override detected platform")
    demo_p.add_argument("--generator", choices=["hermes", "mock"], default=None)
    demo_p.add_argument("--require-hermes", action="store_true", help="Do not fall back to mock")
    demo_p.add_argument("--skip-gate", action="store_true", help="Skip the needs_review/blocked gate")

    regen_p = sub.add_parser("regen-pdf", help="Re-render and upload PDF from stored HTML report")
    regen_p.add_argument("--audit-id", required=True, help="Audit UUID")

    sub.add_parser("diagnose-hermes", help="Check Hermes gateway reachability/auth")
    sub.add_parser("validate-hermes", help="Send a tiny health-check completion")
    sub.add_parser("release-preflight", help="Verify production schema and embedded runtime without mutations")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = WorkerSettings.from_env()

    if args.command == "run":
        return cmd_run(settings, once=args.once)
    if args.command == "run-pdf":
        return cmd_run_pdf(settings, once=args.once)
    if args.command == "demo":
        return cmd_demo(settings, args)
    if args.command == "regen-pdf":
        return cmd_regen_pdf(settings, args.audit_id)
    if args.command == "diagnose-hermes":
        return cmd_diagnose(settings)
    if args.command == "validate-hermes":
        return cmd_validate(settings)
    if args.command == "release-preflight":
        result = run_preflight(settings)
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
        return 0 if result.ok else 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
