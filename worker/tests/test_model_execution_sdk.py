import pytest
from types import SimpleNamespace


def test_sdk_boundary_has_no_implicit_qualification_or_fallback():
    from auditlayer_worker.model_execution.sdk import SDKBoundary, wire_parameters
    from auditlayer_worker.model_execution.catalog import CATALOG
    model = CATALOG['gpt-5.6-sol']
    client = SimpleNamespace(base_url=model.data_route)
    with pytest.raises(ValueError, match='unavailable'):
        SDKBoundary(client, model, lambda messages: 100)
    with pytest.raises(ValueError, match='route'):
        SDKBoundary(SimpleNamespace(base_url='https://wrong.invalid'), model,
                    lambda messages: 100, qualification_id='offline-test')
    from test_model_execution_executor import setup
    _, request, _ = setup()
    params = wire_parameters(request)
    assert params['max_completion_tokens'] == 1000
    assert params['stream'] is False and params['n'] == 1
    assert params['tool_choice'] == 'none'
    assert params['reasoning_effort'] == 'none'
    assert 'tools' not in params


def test_sdk_released_interface_called_once_with_retries_disabled():
    from auditlayer_worker.model_execution.sdk import SDKBoundary
    from test_model_execution_executor import setup
    _, request, _ = setup()
    calls = []
    class Client:
        base_url = request.model.data_route
        def with_options(self, **kwargs):
            calls.append(kwargs)
            return self
        @property
        def chat(self):
            return SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(model_dump=lambda: {'model': request.model.model})
    boundary = SDKBoundary(Client(), request.model, lambda messages: 100,
                           qualification_id='offline-test')
    assert boundary.count_input(request.messages) == 100
    assert boundary.complete(request, request.model)['model'] == request.model.model
    assert calls[0]['max_retries'] == 0 and calls[0]['timeout'] == 2
    assert calls[0]['http_client'].follow_redirects is False
    assert len(calls) == 2


def test_reconciliation_absorbs_failures_and_rejects_duplicate_receipts():
    from auditlayer_worker.model_execution.accounting import summarize
    from auditlayer_worker.model_execution.execution import Result
    from auditlayer_worker.model_execution import NormalizedUsage
    failed = Result('a', 'intent', 'r1', 'h1', None,
        NormalizedUsage('actual', 10, 10), 'invalid_analysis', 'absorbed_failure', 250)
    success = Result('b', 'intent', 'r2', 'h2', {},
        NormalizedUsage('actual', 100, 200), None, 'successful_path', 4500)
    totals = summarize([failed, success])
    assert totals['rated_upstream_microusd'] == 4750
    assert totals['customer_microusd'] == 13500
    assert totals['absorbed_microusd'] == 250
    assert totals['pending_reconciliation'] is False
    with pytest.raises(ValueError, match='duplicate'):
        summarize([success, success])
    from dataclasses import replace
    with pytest.raises(ValueError, match='successful'):
        summarize([success, replace(success, attempt_id='c', admission_receipt_id='r3')])
    unknown = replace(failed, rated_upstream_microusd=None, usage=NormalizedUsage())
    assert summarize([unknown, success])['pending_reconciliation'] is True
    assert summarize([unknown, success])['rated_upstream_microusd'] is None


def test_unknown_or_estimated_success_cannot_be_charged_by_summary():
    from auditlayer_worker.model_execution.accounting import summarize
    from auditlayer_worker.model_execution.execution import Result
    from auditlayer_worker.model_execution import NormalizedUsage
    forged = Result('a', 'intent', 'r1', 'h1', {}, NormalizedUsage(),
                    None, 'successful_path', 100)
    with pytest.raises(ValueError, match='usage'):
        summarize([forged])
