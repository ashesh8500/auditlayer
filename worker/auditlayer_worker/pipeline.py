"""Generation pipeline: turn a claimed audit into a stored, billed report.

Emits the shared granular event phases so the frontend can render a live
agentic timeline:

    started -> researching -> metrics -> peers -> scoring -> composing
            -> uploaded -> succeeded   (or -> failed)

The same code path serves the Supabase-backed worker and the standalone demo;
only the ``EventSink`` and storage differ.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from contextlib import contextmanager
import json
import os
from pathlib import Path
import threading
import time
import traceback
from typing import Protocol

from .billing import estimate_cost
from .config import WorkerSettings
from .core import (
    AuditRecord,
    AuditStatus,
    CostCapExceeded,
    Goal,
    Plan,
    Platform,
    PROMPT_VERSION,
    build_prompt_footer_line,
    evaluate_intake,
    inject_prompt_footer,
    next_milestone,
    replace_section,
)
from .generation import ReportGenerator
from .account_homes import ensure_account_home
from .hermes_home_scope import HERMES_HOME_LOCK
from .supabase_client import _utcnow


class EventSink(Protocol):
    def emit(self, phase: str, detail: str = "", *, event_type: str | None = None) -> None: ...


@dataclass
class PrintEventSink:
    """Prints events to stdout and records them (used by the demo)."""

    events: list[tuple[str, str, str]] = field(default_factory=list)

    def emit(self, phase: str, detail: str = "", *, event_type: str | None = None) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.events.append((ts, phase, detail))
        label = event_type or phase
        suffix = f" - {detail}" if detail else ""
        print(f"  [{ts}] {label:<12}{suffix}", flush=True)


class SupabaseEventSink:
    def __init__(self, gateway, audit_id: str):
        self.gateway = gateway
        self.audit_id = audit_id

    def emit(self, phase: str, detail: str = "", *, event_type: str | None = None) -> None:
        self.gateway.emit_event(self.audit_id, phase, detail, event_type=event_type)
        if event_type == "heartbeat":
            self.gateway.update_audit(self.audit_id)


_HEARTBEAT_INTERVAL = 60.0  # seconds between heartbeat audit_events during generation


class _Heartbeat:
    """Context manager that fires heartbeat events while generation runs.

    Wraps the sink with phase tracking so heartbeat events reflect the
    most recently emitted phase (defaults to "researching" if nothing
    has been emitted yet).  The heartbeat thread is a daemon — if the
    process crashes it stops silently without blocking shutdown.
    """

    def __init__(self, sink: EventSink, interval: float = _HEARTBEAT_INTERVAL):
        self._sink = sink
        self._interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._phase: str = "researching"

    def progress(self, phase: str, detail: str = "") -> None:
        """Drop-in replacement for ``sink.emit`` that tracks the current phase."""
        self._phase = phase
        self._sink.emit(phase, detail)

    def _loop(self) -> None:
        start = time.monotonic()
        while not self._stop.wait(self._interval):
            elapsed = time.monotonic() - start
            mins = int(elapsed // 60)
            secs = int(elapsed % 60)
            detail = f"Heartbeat — {mins}m {secs}s elapsed"
            try:
                self._sink.emit(self._phase, detail, event_type="heartbeat")
            except Exception:
                pass  # heartbeat must never crash the worker

    def __enter__(self) -> "_Heartbeat":
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name="audit-heartbeat",
        )
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)


def _fetch_benchmark_cache(gateway) -> list[dict] | None:
    """Fetch all cached wellness benchmarks + peers from Supabase.

    Returns None only for local/demo runs without a gateway. Production schema
    drift is fatal so deployment cannot silently omit benchmark calibration.
    The full dataset is small (~30 rows) so we fetch everything and let the
    Hermes agent pick the relevant niche.
    """
    if gateway is None:
        return None
    res = gateway.client.table("wellness_benchmarks").select("niche").execute()
    niches = list({r["niche"] for r in (res.data or []) if r.get("niche")})
    if not niches:
        return []
    return gateway.get_cached_benchmarks(niches)


@dataclass
class RunSummary:
    audit_id: str
    status: str
    wall_clock_seconds: float
    tokens_in: int
    tokens_out: int
    cost_usd: float
    model: str
    estimated_tokens: bool
    prompt_version: str = ""
    report_path: str | None = None
    pdf_path: str | None = None
    pdf_mode: str | None = None
    note: str = ""


def _plan_from(value: str | None) -> Plan:
    try:
        return Plan(value) if value else Plan.FREE
    except ValueError:
        return Plan.FREE


def recalibrate(audit: AuditRecord, *, gifted_audits: int = 1) -> AuditStatus:
    """Re-apply intake calibration as a worker-side gate.

    Returns the status the worker should honor.  Only hard-blocks on truly
    invalid state (empty handle).  Does **not** re-check plan limits or
    platform uncertainty — if the web queued the audit, the worker trusts
    that decision.

    ``gifted_audits`` defaults to 1 (i.e. "trust the web's decision") so
    trial / comp users are never re-blocked by the worker.  Pass 0 only when
    calling from a path that has no prior web intake validation (e.g. demo).
    """
    decision = evaluate_intake(
        handle=audit.handle,
        goal=audit.goal,
        context=audit.context,
        plan=_plan_from(audit.plan),
        platform=Platform(audit.platform) if audit.platform in Platform._value2member_map_ else Platform.UNKNOWN,
        gifted_audits=gifted_audits,
    )
    # Merge any new limitations the calibration surfaced.
    for lim in decision.limitations:
        if lim not in audit.limitations:
            audit.limitations.append(lim)
    if not audit.milestone_label:
        audit.milestone_label = decision.milestone_label or next_milestone(None)
    return decision.status


class GenerationPipeline:
    def __init__(self, settings: WorkerSettings, generator: ReportGenerator):
        self.settings = settings
        self.generator = generator

    def run(
        self,
        audit: AuditRecord,
        sink: EventSink,
        *,
        gateway=None,
        enforce_gate: bool = True,
        token_cap: int = 0,
        cost_cap_usd: float = 0.0,
    ) -> RunSummary:
        started_at = time.monotonic()
        sink.emit("started", f"Worker claimed audit for @{audit.handle} ({audit.goal})")

        try:
            account_home = self._account_home(audit)
        except Exception as exc:  # noqa: BLE001 - persist a terminal operator-visible failure
            note = f"Account home setup failed: {exc}"
            sink.emit("failed", "Account memory setup failed. Founder review is required.")
            if gateway is not None:
                gateway.update_audit(
                    audit.id,
                    status=AuditStatus.FAILED.value,
                    admin_notes=note[:500],
                    last_failed_at=_utcnow(),
                )
            return RunSummary(
                audit_id=audit.id,
                status=AuditStatus.FAILED.value,
                wall_clock_seconds=round(time.monotonic() - started_at, 2),
                tokens_in=0,
                tokens_out=0,
                cost_usd=0.0,
                model="-",
                estimated_tokens=False,
                note=note,
            )

        if enforce_gate:
            gate = recalibrate(audit)
            # Only hard-block on truly invalid audits (empty handle, plan limit).
            # NEEDS_REVIEW (unknown platform) is a soft gate — if the audit was
            # explicitly queued by founder approval, the worker trusts that decision.
            if gate == AuditStatus.BLOCKED:
                note = "Hard-blocked by intake calibration"
                sink.emit("failed", note)
                if gateway is not None:
                    gateway.update_audit(
                        audit.id,
                        status=gate.value,
                        limitations=audit.limitations,
                        milestone_label=audit.milestone_label,
                    )
                return RunSummary(
                    audit_id=audit.id,
                    status=gate.value,
                    wall_clock_seconds=round(time.monotonic() - started_at, 2),
                    tokens_in=0,
                    tokens_out=0,
                    cost_usd=0.0,
                    model="-",
                    estimated_tokens=False,
                    note=note,
                )

        # Check if this account has a fresh research cache we can reuse.
        # NOTE: only WEB RESEARCH is cached (7-day TTL). Instagram metrics are
        # ALWAYS fetched fresh below — never served from cache.
        research_cache = audit.research_cache
        if gateway is not None and not research_cache and not audit.force_refresh:
            account_cache = _check_account_cache(gateway, audit)
            if account_cache is not None:
                research_cache = account_cache["research_snapshot"]
                cached_at = account_cache.get("last_researched_at", "unknown")
                sink.emit(
                    "researching",
                    f"Research cached — last refreshed {cached_at}",
                    event_type="research_cached",
                )

        # Fetch live Instagram data if the client has connected their account.
        # Runs in parallel with web research — they're independent I/O.
        # ALWAYS fresh, even on a research cache hit.
        ig_metrics = None
        ig_future = None
        if audit.platform == "instagram" and gateway is not None:
            ig_future = _start_instagram_fetch(gateway, audit, sink)

        # ── heartbeat wraps the long-running generate call ──
        result = None
        with self._scoped_home(account_home), _Heartbeat(sink) as hb:
            try:
                result = self.generator.generate(
                    audit, hb.progress,
                    research_cache=research_cache,
                    benchmarks=_fetch_benchmark_cache(gateway),
                    ig_future=ig_future,
                )
                if ig_future is not None:
                    ig_metrics = ig_future.result()
                # ── cost cap enforcement ──
                if token_cap > 0 or cost_cap_usd > 0:
                    cost = estimate_cost(
                        result.tokens_in, result.tokens_out,
                        self.settings.price_in_per_mtok,
                        self.settings.price_out_per_mtok,
                    )
                    total_tokens = result.tokens_in + result.tokens_out
                    if (token_cap > 0 and total_tokens > token_cap) or \
                       (cost_cap_usd > 0 and cost.total_usd > cost_cap_usd):
                        raise CostCapExceeded(total_tokens, token_cap, cost.total_usd)
            except Exception as exc:  # noqa: BLE001 - record failure, never crash the loop
                tb_tail = traceback.format_exc()[-500:]
                is_budget_block = isinstance(exc, CostCapExceeded)
                fail_reason = "cost_cap" if is_budget_block else "error"
                status = AuditStatus.BLOCKED if is_budget_block else AuditStatus.FAILED
                budget_result = result if is_budget_block else None
                spent_tokens_in = budget_result.tokens_in if budget_result is not None else 0
                spent_tokens_out = budget_result.tokens_out if budget_result is not None else 0
                spent_cost = exc.cost_usd if isinstance(exc, CostCapExceeded) else 0.0
                spent_model = budget_result.model if budget_result is not None else "-"
                private_detail = f"{fail_reason}: {exc}" if is_budget_block else tb_tail
                public_detail = (
                    "Generation stopped by the configured usage budget. Founder review is required."
                    if is_budget_block
                    else "Generation failed. The team has the diagnostic details and will retry if safe."
                )
                # Budget breaches are deterministic and must not enter the automatic retry loop.
                hb.progress("failed", public_detail)
                if gateway is not None:
                    gateway.emit_event(
                        audit.id,
                        "failed",
                        detail=public_detail,
                        event_type=fail_reason,
                        actor="worker",
                    )
                    gateway.update_audit(
                        audit.id,
                        status=status.value,
                        admin_notes=private_detail[:500],
                        last_failed_at=_utcnow(),
                        tokens_in=spent_tokens_in,
                        tokens_out=spent_tokens_out,
                        cost_usd=spent_cost,
                        model=spent_model,
                    )
                return RunSummary(
                    audit_id=audit.id,
                    status=status.value,
                    wall_clock_seconds=round(time.monotonic() - started_at, 2),
                    tokens_in=spent_tokens_in,
                    tokens_out=spent_tokens_out,
                    cost_usd=spent_cost,
                    model=spent_model,
                    estimated_tokens=False,
                    note=str(exc),
                )

        assert result is not None
        cost = estimate_cost(
            result.tokens_in,
            result.tokens_out,
            self.settings.price_in_per_mtok,
            self.settings.price_out_per_mtok,
        )

        # Inject prompt version footer into the HTML for reproducibility.
        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        footer_line = build_prompt_footer_line(
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            cost_usd=cost.total_usd,
            generated_at=generated_at,
            version=PROMPT_VERSION,
        )
        final_html = inject_prompt_footer(result.html, footer_line)

        report_path = pdf_path = None
        pdf_mode = None
        if gateway is not None:
            report_path = gateway.upload_report(audit.id, final_html)
            # Mark audit ready immediately — PDF is async. Only storage paths
            # are persisted; signed URLs are never written to the audits row.
            try:
                gateway.update_audit(
                    audit.id,
                    status=AuditStatus.READY.value,
                    report_path=report_path,
                    pdf_status='pending',
                    tokens_in=result.tokens_in,
                    tokens_out=result.tokens_out,
                    cost_usd=cost.total_usd,
                    model=result.model,
                    prompt_version=PROMPT_VERSION,
                    milestone_label=audit.milestone_label,
                    limitations=audit.limitations,
                    research_cache="",
                )
            except Exception as exc:
                sink.emit(
                    "failed",
                    f"update_audit failed after upload — report is in storage, manual finalize needed: {exc}",
                )
            sink.emit("uploaded", "HTML report stored — PDF queued for async generation")
        else:
            report_path, pdf_path, pdf_mode = self._write_local(audit.id, final_html)
            sink.emit("uploaded", f"HTML + {pdf_mode} PDF written to {Path(report_path).parent}")

        sink.emit(
            "succeeded",
            f"Ready - {result.tokens_in}+{result.tokens_out} tok, ~${cost.total_usd:.2f}",
        )

        # Link audit to account and write progression data.
        if gateway is not None and audit.user_id:
            _link_account_and_progression(gateway, audit, ig_metrics, research_cache=result.research_cache)

        return RunSummary(
            audit_id=audit.id,
            status=AuditStatus.READY.value,
            wall_clock_seconds=round(time.monotonic() - started_at, 2),
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            cost_usd=cost.total_usd,
            model=result.model,
            estimated_tokens=result.estimated,
            prompt_version=PROMPT_VERSION,
            report_path=report_path,
            pdf_path=pdf_path,
            pdf_mode=pdf_mode,
        )

    def refine(
        self,
        audit: AuditRecord,
        current_html: str,
        section: str,
        instruction: str,
        sink: EventSink,
    ) -> tuple[str, int, int]:
        """Run a section-scoped refinement, returning (new_full_html, t_in, t_out)."""
        account_home = self._account_home(audit)
        with self._scoped_home(account_home):
            result = self.generator.refine(audit, current_html, section, instruction, sink.emit)
        new_html = replace_section(current_html, section, result.fragment)
        return new_html, result.tokens_in, result.tokens_out

    # -- helpers -----------------------------------------------------------

    def _account_home(self, audit: AuditRecord) -> str | None:
        if not audit.user_id:
            return None
        return str(ensure_account_home(audit.user_id, self.settings.alm_accounts_root))

    @staticmethod
    @contextmanager
    def _scoped_home(home: str | None):
        with HERMES_HOME_LOCK:
            previous = os.environ.get("HERMES_HOME")
            if home:
                os.environ["HERMES_HOME"] = home
            try:
                yield
            finally:
                if previous is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = previous

    def _render_pdf(self, html: str):
        from .pdf import render_pdf

        return render_pdf(html, mode=self.settings.pdf_mode, chromium_path=self.settings.chromium_path)

    def _write_local(self, audit_id: str, html: str) -> tuple[str, str, str]:
        from .pdf import render_pdf

        out = self.settings.output_dir
        out.mkdir(parents=True, exist_ok=True)
        html_path = out / f"{audit_id}.html"
        html_path.write_text(html, encoding="utf-8")
        pdf_result = render_pdf(html, mode=self.settings.pdf_mode, chromium_path=self.settings.chromium_path)
        pdf_path = out / f"{audit_id}.pdf"
        pdf_path.write_bytes(pdf_result.data)
        return str(html_path), str(pdf_path), pdf_result.mode


def _start_instagram_fetch(gateway, audit, sink):
    """Launch Instagram API fetch in a background thread.

    Runs token lookup and full-metrics call while the generator does
    independent web research. Returns a Future that resolves to
    ig_metrics or None.
    """
    from concurrent.futures import ThreadPoolExecutor

    pool = ThreadPoolExecutor(max_workers=1)

    def _fetch():
        try:
            token_info = (
                gateway.get_instagram_token(audit.handle, audit.user_id)
                if audit.user_id
                else None
            )
        except Exception as exc:
            print(
                f"[worker] Instagram connection lookup failed for @{audit.handle}: "
                f"{type(exc).__name__}"
            )
            token_info = None

        if token_info is None:
            sink.emit(
                "researching",
                "No usable connected Instagram account was found. Using verified public Instagram signals.",
                event_type="instagram_public_fallback",
            )
            return None

        token, ig_user_id = token_info
        from .instagram_api import InstagramAPIClient

        client = InstagramAPIClient(token)
        try:
            metrics = client.get_full_metrics(ig_user_id)
            sink.emit(
                "researching",
                (
                    "Connected Instagram Graph API loaded: "
                    f"{metrics.profile.followers_count:,} followers, "
                    f"{len(metrics.recent_media)} recent posts, "
                    f"{metrics.avg_engagement_rate}% average engagement."
                ),
                event_type="instagram_api",
            )
            return metrics
        except Exception as exc:
            print(
                f"[worker] Instagram API unavailable for @{audit.handle}: "
                f"{type(exc).__name__}"
            )
            sink.emit(
                "researching",
                "Connected Instagram data was unavailable. Using verified public Instagram signals.",
                event_type="instagram_api_fallback",
            )
            return None
        finally:
            client.close()

    return pool.submit(_fetch)


def _link_account_and_progression(gateway, audit, ig_metrics, *, research_cache: str = "") -> None:
    """Upsert the account row and write progression data after a successful audit.

    Best-effort — failures here must not block the audit from being marked ready.
    """
    try:
        account = (
            gateway.client.table("accounts")
            .upsert(
                {
                    "user_id": audit.user_id,
                    "handle": audit.handle,
                    "platform": audit.platform,
                    "last_researched_at": _utcnow(),
                    # research_cache is already a plain-text evidence blob — store
                    # it raw (bounded). Do NOT json.dumps: it double-quotes the
                    # payload and the reader returns it verbatim, feeding the model
                    # a quoted string on the next cache hit.
                    "research_snapshot": (research_cache[:10000] if research_cache else None),
                    "cache_valid_until": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                },
                on_conflict="user_id,handle,platform",
            )
            .execute()
        )
        account_id = (account.data or [{}])[0].get("id")
        if not account_id:
            return

        # Link the audit to this account.
        gateway.client.table("audits").update(
            {"account_id": account_id}
        ).eq("id", audit.id).execute()

        # Write progression row if we have metrics.
        if ig_metrics is not None:
            profile = getattr(ig_metrics, "profile", None)
            gateway.client.table("account_progression").upsert(
                {
                    "account_id": account_id,
                    "audit_id": audit.id,
                    "followers": int(getattr(profile, "followers_count", 0) or 0),
                    "engagement": float(getattr(ig_metrics, "avg_engagement_rate", 0) or 0),
                    "avg_likes": float(getattr(ig_metrics, "avg_likes", 0) or 0),
                    "avg_comments": float(getattr(ig_metrics, "avg_comments", 0) or 0),
                },
                on_conflict="audit_id",
            ).execute()
    except Exception:
        pass  # best-effort — don't fail the audit over account bookkeeping


def _check_account_cache(gateway, audit) -> dict | None:
    """Return cached WEB RESEARCH only for this audit's account if still valid.

    Instagram metrics are never cached — they are always fetched fresh.
    """
    try:
        now = datetime.now(timezone.utc)
        # Only WEB RESEARCH is cached. Instagram metrics are never read from
        # cache — they are always fetched fresh per audit.
        res = (
            gateway.client.table("accounts")
            .select("research_snapshot, last_researched_at, cache_valid_until")
            .eq("user_id", audit.user_id)
            .eq("handle", audit.handle)
            .eq("platform", audit.platform)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        if row is None:
            return None
        cache_valid = row.get("cache_valid_until")
        if not cache_valid:
            return None
        if now >= datetime.fromisoformat(cache_valid):
            return None
        snapshot = row.get("research_snapshot")
        if not snapshot:
            return None
        # Defensive: legacy rows may have been json.dumps'd (double-quoted). If
        # so, unwrap once. New rows are stored raw. IG metrics never cached.
        if isinstance(snapshot, str) and snapshot.startswith('"'):
            try:
                snapshot = json.loads(snapshot)
            except Exception:
                pass
        return {
            "research_snapshot": snapshot,
            "last_researched_at": row.get("last_researched_at") or "",
        }
    except Exception:
        return None  # best-effort — fall through to fresh research
