"""Exercise execution with a fake SDK boundary and real parser/budgets/processes."""
import json
from dataclasses import replace
from types import SimpleNamespace
import pytest

from auditlayer_worker.core import AuditRecord, STANDARD_SECTIONS


def analysis():
    return json.dumps({'sections': [
        {'heading': h.replace('[Milestone]', '20K Followers'), 'lede': 'Data needed.',
         'items': [{'title': 'Observe', 'body': 'Collect evidence before a decision.'}]}
        for h in STANDARD_SECTIONS
    ]})


class Admission:
    def __init__(self):
        self.calls = []
    def consume(self, attempt_id, expected):
        self.calls.append((attempt_id, expected))
        return dict(expected, receipt_id='reserved-once')


class Boundary:
    """Only provider boundary is fake; no patched parser/clock/admission checks."""
    def count_input(self, messages):
        return 100
    def complete(self, request, model):
        return {'model': model.model, 'choices': [{'finish_reason': 'stop',
            'message': {'content': analysis()}}],
            'usage': {'prompt_tokens': 100, 'completion_tokens': 200}}


def setup():
    from auditlayer_worker.model_execution.execution import Executor, Request
    from auditlayer_worker.model_execution.catalog import CATALOG
    model = CATALOG['gpt-5.6-sol']
    audit = AuditRecord(id='audit', handle='example', platform='instagram', goal='growth', context='')
    request = Request(owner_id='owner', subject_id='subject', intent_id='intent',
        attempt_id='attempt-1', model=model, audit=audit,
        system='Return strict report JSON.', user='Untrusted evidence.',
        max_input=1000, max_output=1000, timeout_seconds=2)
    admission = Admission()
    return Executor(Boundary(), admission), request, admission


def test_success_validates_real_report_and_reserves_before_one_call():
    executor, request, admission = setup()
    result = executor.execute(request)
    assert result.error is None
    assert len(result.analysis['sections']) == len(STANDARD_SECTIONS)
    assert result.usage.state == 'actual'
    assert result.disposition == 'successful_path'
    assert result.actual_upstream_microusd is None  # tokens are not an invoice
    assert result.rated_upstream_microusd == 4500
    expected = admission.calls[0][1]
    assert expected['upstream_max_microusd'] == 25000
    assert expected['customer_max_microusd'] == 75000
    assert expected['owner_id'] == 'owner'
    assert expected['subject_id'] == 'subject'
    assert expected['intent_id'] == 'intent'
    with pytest.raises(ValueError, match='attempt'):
        executor.execute(request)


@pytest.mark.parametrize('changes', [
    {'tools': ('web',)}, {'max_input': 99}, {'max_output': 18001},
    {'max_input': True}, {'max_output': 0}, {'timeout_seconds': float('inf')},
    {'timeout_seconds': 0}, {'timeout_seconds': 151}, {'owner_id': ''},
])
def test_policy_rejected_before_admission(changes):
    executor, request, admission = setup()
    with pytest.raises(ValueError):
        executor.execute(replace(request, **changes))
    assert admission.calls == []


def test_unrecognized_route_and_rate_tamper_rejected_before_admission():
    executor, request, admission = setup()
    for model in (replace(request.model, data_route='https://evil.invalid'),
                  replace(request.model, input_rate=1)):
        with pytest.raises(ValueError):
            executor.execute(replace(request, model=model))
    assert admission.calls == []


@pytest.mark.parametrize('field', ['owner_id', 'subject_id', 'intent_id', 'model',
    'data_route', 'rate_card_version', 'request_fingerprint', 'customer_max_microusd',
    'upstream_max_microusd'])
def test_mismatched_receipt_cannot_dispatch(field):
    executor, request, admission = setup()
    def wrong(attempt_id, expected):
        return dict(expected, receipt_id='bad', **{field: 'wrong'})
    admission.consume = wrong
    with pytest.raises(ValueError, match='receipt'):
        executor.execute(request)


@pytest.mark.parametrize('mutation,error', [
    ({'model': 'different-model'}, 'model_drift'),
    ({'choices': [{'finish_reason': 'stop', 'message': {'refusal': 'No'}}]}, 'refusal'),
    ({'choices': [{'finish_reason': 'length', 'message': {'content': analysis()}}]}, 'truncated'),
    ({'choices': [{'finish_reason': 'stop', 'message': {'tool_calls': [{}], 'content': analysis()}}]}, 'tool_call'),
    ({'choices': [{'finish_reason': 'stop', 'message': {'content': '<html>bad</html>'}}]}, 'invalid_analysis'),
    ({'usage': {'prompt_tokens': 1001, 'completion_tokens': 200}}, 'usage_limit'),
    ({'usage': {'prompt_tokens': 100, 'completion_tokens': 1001}}, 'usage_limit'),
])
def test_provider_failures_are_absorbed_without_retry(mutation, error):
    executor, request, _ = setup()
    class Mutated(Boundary):
        def complete(self, request, model):
            return dict(super().complete(request, model), **mutation)
    executor.boundary = Mutated()
    result = executor.execute(request)
    assert result.error == error
    assert result.analysis is None
    assert result.disposition == 'absorbed_failure'


def test_missing_usage_is_pending_not_zero_or_estimated_actual():
    executor, request, _ = setup()
    class Missing(Boundary):
        def complete(self, request, model):
            return dict(super().complete(request, model), usage=None)
    executor.boundary = Missing()
    result = executor.execute(request)
    assert result.analysis is not None
    assert result.disposition == 'pending_reconciliation'
    assert result.usage.state == 'unknown'
    assert result.rated_upstream_microusd is None


def test_exception_is_sanitized_and_has_unknown_liability():
    executor, request, _ = setup()
    class Broken(Boundary):
        def complete(self, request, model):
            raise RuntimeError('secret provider payload MUST NOT leak')
    executor.boundary = Broken()
    result = executor.execute(request)
    assert result.error == 'provider_error'
    assert result.usage.state == 'unknown'
    assert 'secret' not in repr(result)


def test_timeout_actually_terminates_stalled_provider():
    import multiprocessing
    import time
    executor, request, _ = setup()
    counter = multiprocessing.get_context('fork').Value('i', 0)
    class Stalled(Boundary):
        def complete(self, request, model):
            until = time.monotonic() + .3
            while time.monotonic() < until:
                with counter.get_lock():
                    counter.value += 1
                time.sleep(.01)
            return super().complete(request, model)
    executor.boundary = Stalled()
    started = time.monotonic()
    result = executor.execute(replace(request, timeout_seconds=.08))
    assert result.error == 'timeout'
    assert time.monotonic() - started < 1
    stopped = counter.value
    time.sleep(.04)
    assert counter.value == stopped
    assert result.usage.state == 'unknown'
    with pytest.raises(ValueError, match='attempt'):
        executor.execute(replace(request, timeout_seconds=.08))


@pytest.mark.parametrize('content', [
    '{"sections": [], "sections": []}', '{"sections": [], "html": "bad"}',
    '{"sections": NaN}', '{"sections": []}', '```json\n{}\n```',
])
def test_real_parser_rejects_duplicate_nonfinite_and_wrong_sections(content):
    from auditlayer_worker.model_execution.execution import parse_analysis
    _, request, _ = setup()
    with pytest.raises(ValueError):
        parse_analysis(content, request.audit)


def test_two_attempts_do_not_hide_upstream_failures_or_replay():
    import multiprocessing
    executor, request, _ = setup()
    calls = multiprocessing.get_context('fork').Value('i', 0)
    class Counted(Boundary):
        def complete(self, request, model):
            with calls.get_lock():
                calls.value += 1
            return super().complete(request, model)
    executor.boundary = Counted()
    executor.execute(request)
    with pytest.raises(ValueError):
        executor.execute(request)
    assert calls.value == 1
