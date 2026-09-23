"""Offline product-provider contract tests; SDK transport is the only fake."""
import json
from dataclasses import replace

import httpx
import pytest
from openai import OpenAI

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.hermes_inprocess import InProcessHermesClient

MODEL = "deepseek/deepseek-v4-flash-0731"


@pytest.fixture
def settings(monkeypatch, fake_agent_root):
    monkeypatch.setattr("auditlayer_worker.config.load_env_files", lambda: None)
    return replace(WorkerSettings.from_env(), hermes_provider="openrouter", hermes_model=MODEL,
                   hermes_mode="inprocess", hermes_agent_root=fake_agent_root)


def test_product_sdk_dispatch_is_explicit_and_records_actual_cost(settings, monkeypatch):
    calls = []
    def handle(request):
        calls.append(json.loads(request.content))
        assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer owned-test-key"
        return httpx.Response(200, json={
            "id": "gen-test", "object": "chat.completion", "created": 1, "model": MODEL,
            "provider": "DeepSeek", "choices": [{"index": 0, "finish_reason": "stop",
            "message": {"role": "assistant", "content": '{"sections": []}'}}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30, "cost": 0.003},
        })
    sdk = OpenAI(api_key="owned-test-key", base_url="https://openrouter.ai/api/v1",
                 max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(handle)))
    monkeypatch.setenv("ALM_OPENROUTER_API_KEY", "owned-test-key")
    monkeypatch.setattr("openai.OpenAI", lambda **kwargs: sdk)
    # Exercise real SDK locally; process isolation is independently covered.
    monkeypatch.setattr("auditlayer_worker.openrouter.one_call",
                        lambda boundary, request, deadline: {"raw": boundary.complete(request, request.model)})
    result = InProcessHermesClient(settings).chat(
        [{"role": "user", "content": "evidence"}], MODEL, max_tokens=100, session_id="audit-test")
    assert calls[0]["model"] == MODEL
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert calls[0]["provider"]["allow_fallbacks"] is False
    assert calls[0]["provider"]["require_parameters"] is True
    assert calls[0]["reasoning"] == {"enabled": False}
    assert calls[0]["stream"] is False
    assert "tools" not in calls[0] and "models" not in calls[0]
    assert result.usage.cost_usd == 0.003
    assert result.usage.cost_source == "provider_actual"
    assert result.telemetry["response_id"] == "gen-test"
    assert result.telemetry["requested_model"] == MODEL
    assert result.telemetry["correlation_id"] == "audit-test"
    assert result.telemetry["latency_ms"] >= 0
    assert result.telemetry["retry_count"] == 0


@pytest.mark.parametrize("usage, source, cost", [
    ({"prompt_tokens": 10, "completion_tokens": 5}, "rate_estimated", 0.0000028),
    ({"prompt_tokens": 0, "completion_tokens": 0, "cost": 0}, "provider_actual", 0),
    ({}, "unknown", None),
    ({"prompt_tokens": -1, "completion_tokens": 5, "cost": float("nan")}, "unknown", None),
    ({"prompt_tokens": True, "completion_tokens": 5}, "unknown", None),
])
def test_usage_provenance_never_invents_actuals(settings, monkeypatch, usage, source, cost):
    monkeypatch.setenv("ALM_OPENROUTER_API_KEY", "owned-test-key")
    monkeypatch.setattr("auditlayer_worker.openrouter.one_call", lambda *args: {"raw": {
        "id": "gen-test", "model": MODEL, "usage": usage,
        "choices": [{"finish_reason": "stop", "message": {"content": "{}"}}]}})
    result = InProcessHermesClient(settings).chat([{"role": "user", "content": "x"}], MODEL)
    assert result.usage.cost_source == source
    assert result.usage.cost_usd == cost
    assert result.usage.estimated is (source == "unknown")
    assert result.telemetry["usage_status"] == ("unknown" if source == "unknown" else "actual")


def test_pre_call_reservation_holds_failed_spend_and_bounds_retries(settings, monkeypatch):
    monkeypatch.setenv("ALM_OPENROUTER_API_KEY", "owned-test-key")
    calls = []
    def fail(*args):
        calls.append(1)
        return {"error": "timeout"}
    monkeypatch.setattr("auditlayer_worker.openrouter.one_call", fail)
    client = InProcessHermesClient(replace(settings, cost_cap_usd=0.0002))
    with pytest.raises(RuntimeError, match="openrouter_timeout") as error:
        client.chat([{"role": "user", "content": "x"}], MODEL, max_tokens=100)
    assert error.value.telemetry["cost_source"] == "unknown"
    assert error.value.telemetry["customer_charge_usd"] == 0
    assert error.value.telemetry["reserved_usd"] > 0
    with pytest.raises(RuntimeError, match="reservation"):
        client.chat([{"role": "user", "content": "x"}], MODEL, max_tokens=100)
    assert len(calls) == 1


@pytest.mark.parametrize("response_model,finish", [("another/model", "stop"), (MODEL, "length"), (MODEL, "error")])
def test_failed_responses_preserve_billed_cost(settings, monkeypatch, response_model, finish):
    monkeypatch.setenv("ALM_OPENROUTER_API_KEY", "owned-test-key")
    monkeypatch.setattr("auditlayer_worker.openrouter.one_call", lambda *args: {"raw": {
        "id": "gen-failed", "model": response_model,
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.004},
        "choices": [{"finish_reason": finish, "message": {"content": "{}"}}]}})
    with pytest.raises(RuntimeError, match="openrouter_response_rejected") as error:
        InProcessHermesClient(settings).chat([{"role": "user", "content": "x"}], MODEL)
    assert error.value.telemetry["cost_usd"] == 0.004
    assert error.value.telemetry["customer_charge_usd"] == 0


def test_no_personal_key_or_model_fallback(settings, monkeypatch):
    monkeypatch.delenv("ALM_OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "personal-key-must-not-be-used")
    monkeypatch.setattr("auditlayer_worker.openrouter.one_call", lambda *args: pytest.fail("dispatched"))
    with pytest.raises(RuntimeError, match="ALM_OPENROUTER_API_KEY"):
        InProcessHermesClient(settings).chat([], MODEL)
    with pytest.raises(RuntimeError, match="model"):
        InProcessHermesClient(settings).chat([], "deepseek/deepseek-v4-flash")


@pytest.mark.parametrize("requested", [None, "auto", MODEL])
def test_product_config_does_not_inherit_engineering_model(monkeypatch, requested):
    monkeypatch.setattr("auditlayer_worker.config.load_env_files", lambda: None)
    monkeypatch.setenv("ALM_INFERENCE_PROVIDER", "openrouter")
    monkeypatch.delenv("ALM_INFERENCE_MODEL", raising=False)
    if requested is not None:
        monkeypatch.setenv("ALM_INFERENCE_MODEL", requested)
    monkeypatch.setenv("HERMES_MODEL", "engineering/model")
    monkeypatch.setenv("HERMES_PROVIDER", "openai-codex")
    config = WorkerSettings.from_env()
    assert (config.hermes_provider, config.hermes_model) == ("openrouter", MODEL)


def test_factory_uses_product_pin_not_database_model(settings):
    from types import SimpleNamespace
    from auditlayer_worker.worker import build_generator
    runtime = SimpleNamespace(build_client=lambda: InProcessHermesClient(settings))
    app = SimpleNamespace(hermes_model="engineering/model", enabled_toolsets=(), token_cap=120000, cost_cap_usd=3)
    generator = build_generator(settings, app, runtime=runtime)
    assert generator.model == MODEL


def test_preflight_accepts_explicit_openrouter_and_requires_owned_key(settings, monkeypatch):
    from types import SimpleNamespace
    from auditlayer_worker.release_preflight import run_preflight
    monkeypatch.setattr("auditlayer_worker.release_preflight.diagnose_embedded", lambda: SimpleNamespace(ok=True))
    monkeypatch.delenv("ALM_OPENROUTER_API_KEY", raising=False)
    result = run_preflight(settings)
    assert any("ALM_OPENROUTER_API_KEY" in e for e in result.errors)
    assert not any("must be deepseek" in e for e in result.errors)


def test_existing_run_ledger_persists_safe_call_receipts(settings):
    from unittest.mock import MagicMock
    from auditlayer_worker.supabase_client import SupabaseGateway
    gateway = object.__new__(SupabaseGateway)
    gateway.client = MagicMock()
    gateway.finish_report_generation_run("run-id", status="blocked", total_seconds=1,
        stage_timings={"analysis": 0.5, "_inference": [{
            "provider": "openrouter", "response_id": "gen-123", "requested_model": MODEL,
            "cost_usd": None, "cost_source": "unknown", "usage_status": "unknown",
            "latency_ms": 10, "retry_count": 0, "customer_charge_usd": 0,
            "prompt": "private evidence", "api_key": "secret"}]})
    payload = gateway.client.table.return_value.update.call_args.args[0]
    receipt = payload["stage_timings"]["_inference"][0]
    assert receipt["response_id"] == "gen-123"
    assert receipt["cost_usd"] is None
    assert "prompt" not in receipt and "api_key" not in receipt


def test_reservation_ledger_requires_matching_running_row_readback(settings):
    from unittest.mock import MagicMock
    from auditlayer_worker.supabase_client import SupabaseGateway
    gateway = object.__new__(SupabaseGateway)
    gateway.client = MagicMock()
    receipt = {"attempt_id": "a1", "status": "reserved", "cost_usd": None}
    query = gateway.client.table.return_value
    query.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"audit_id": None, "refinement_id": "ref-1", "stage_timings": {"_inference": [receipt]}}]
    gateway.record_report_inference_calls("run-1", [receipt])
    query.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(RuntimeError, match="reservation ledger"):
        gateway.record_report_inference_calls("run-1", [receipt])


@pytest.mark.parametrize("receipts,source,total", [
    ([{"cost_usd": 0.003, "cost_source": "provider_actual"}], "provider_actual", 0.123),
    ([{"cost_usd": None, "cost_source": "unknown"}], "unknown", 0.12),
    ([{"cost_usd": 0.003, "cost_source": "provider_actual"}, {"cost_usd": 0.002, "cost_source": "rate_estimated"}], "rate_estimated", 0.125),
])
def test_existing_cost_struct_prefers_receipts(receipts, source, total):
    from auditlayer_worker.billing import estimate_cost
    cost = estimate_cost(1000, 1000, 100, 100, inference_calls=receipts)
    assert cost.total_usd == total
    assert cost.inference_cost_source == source


@pytest.mark.parametrize("plan", ["brand", "studio"])
def test_credit_plans_are_not_reinterpreted_as_free_lifetime_reports(plan):
    from auditlayer_worker.core import Plan, evaluate_intake, Platform
    from auditlayer_worker.pipeline import _plan_from
    assert _plan_from(plan).value == plan
    decision = evaluate_intake("example", "growth", plan=Plan(plan), platform=Platform.YOUTUBE,
                               completed_audits=100000)
    assert decision.accepted  # Credit/cycle/brand reservation is SQL-owned, not a report-count quota.
    assert not evaluate_intake("", "growth", plan=Plan(plan)).accepted


def test_refinement_containment_can_host_bounded_sdk_call():
    import time
    from types import SimpleNamespace
    from auditlayer_worker.hermes_inprocess import run_bounded_refinement
    from auditlayer_worker.model_execution.containment import one_call
    class Boundary:
        def complete(self, request, model):
            return {"model": model}
    def operation():
        return one_call(Boundary(), SimpleNamespace(model=MODEL), time.monotonic() + 1) == {"raw": {"model": MODEL}}
    assert run_bounded_refinement(operation, deadline=time.monotonic() + 3)


def test_factory_applies_app_caps_before_provider_dispatch(settings):
    from types import SimpleNamespace
    from auditlayer_worker.worker import build_generator
    client = InProcessHermesClient(settings)
    runtime = SimpleNamespace(build_client=lambda: client)
    app = SimpleNamespace(hermes_model="ignored", enabled_toolsets=(), token_cap=1000, cost_cap_usd=0.01)
    build_generator(settings, app, runtime=runtime)
    assert client.settings.token_cap == 1000
    assert client.settings.cost_cap_usd == 0.01


def test_reservation_scopes_to_report_not_worker_lifetime(settings):
    client = InProcessHermesClient(settings)
    client.begin_inference_run("audit-1")
    client._inference_reservation.calls = 2
    client.begin_inference_run("audit-1")
    assert client._inference_reservation.calls == 2
    client.begin_inference_run("audit-2")
    assert client._inference_reservation.calls == 0


def test_durable_receipt_is_written_before_dispatch_and_after_response(settings, monkeypatch):
    monkeypatch.setenv("ALM_OPENROUTER_API_KEY", "owned-test-key")
    order = []
    client = InProcessHermesClient(settings)
    client.inference_recorder = lambda receipts: order.append(receipts[-1]["status"])
    def dispatch(*args):
        assert order == ["reserved"]
        return {"raw": {"model": MODEL, "id": "gen-1", "usage": {"prompt_tokens": 1, "completion_tokens": 1, "cost": 0.001},
                        "choices": [{"finish_reason": "stop", "message": {"content": "{}"}}]}}
    monkeypatch.setattr("auditlayer_worker.openrouter.one_call", dispatch)
    client.chat([{"role": "user", "content": "x"}], MODEL)
    assert order == ["reserved", "completed"]


def test_failed_durable_reservation_never_dispatches(settings, monkeypatch):
    monkeypatch.setenv("ALM_OPENROUTER_API_KEY", "owned-test-key")
    client = InProcessHermesClient(settings)
    def reject(receipts):
        raise RuntimeError("ledger unavailable")
    client.inference_recorder = reject
    monkeypatch.setattr("auditlayer_worker.openrouter.one_call", lambda *args: pytest.fail("paid call"))
    with pytest.raises(RuntimeError, match="reservation_persistence_failed"):
        client.chat([{"role": "user", "content": "x"}], MODEL)


@pytest.mark.parametrize("limit,remaining,allowed", [(None,None,True), (5,0,False), (5,4,True)])
def test_key_cap_preflight_reports_limits_without_secret_material(limit, remaining, allowed):
    from auditlayer_worker.openrouter import inspect_key_policy
    def response(request):
        assert str(request.url) == "https://openrouter.ai/api/v1/key"
        return httpx.Response(200, json={"data": {"label": "not-for-logs", "key": "never-return", "limit": limit,
              "limit_remaining": remaining, "usage": 1, "is_free_tier": False, "expires_at": None}})
    metadata, errors = inspect_key_policy("fixture-key", transport=httpx.MockTransport(response))
    assert metadata["limit_usd"] == limit
    assert metadata["remaining_usd"] == remaining
    assert bool(errors) is not allowed
    assert "not-for-logs" not in str(metadata) and "never-return" not in str(metadata)


def test_preflight_exposes_unbounded_key_without_changing_provider_limits(settings, monkeypatch):
    from types import SimpleNamespace
    from auditlayer_worker.release_preflight import run_preflight
    monkeypatch.setenv("ALM_OPENROUTER_API_KEY", "fixture-key")
    monkeypatch.setattr("auditlayer_worker.release_preflight.diagnose_embedded", lambda: SimpleNamespace(ok=True))
    monkeypatch.setattr("auditlayer_worker.openrouter.inspect_key_policy", lambda key: ({"limit_usd": None, "usage_usd": 1}, []))
    result = run_preflight(settings)
    assert result.provider_key_metadata == {"limit_usd": None, "usage_usd": 1}
    assert not any("limit" in e or "exclusiv" in e for e in result.errors)
