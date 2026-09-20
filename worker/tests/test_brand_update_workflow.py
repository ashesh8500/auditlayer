"""Scheduler/control-plane and mail boundary tests; no provider, env or sockets."""
from types import SimpleNamespace
import pytest


def module():
    from auditlayer_worker import brand_update_workflow
    return brand_update_workflow


class Gateway:
    def __init__(self):
        self.calls = []
        self.sent = False
        self.revoked = False
        self.results = []
        self.client = self

    def rpc(self, name, args):
        self.calls.append((name, args))
        def execute():
            if name == 'brand_workflow_send_claim':
                if self.revoked or self.sent:
                    raise ValueError('denied')
                self.sent = True
                return SimpleNamespace(data=dict(delivery_id='11111111-1111-4111-8111-111111111111', recipient_id='owner', recipient_email='owner@example.invalid', artifact_version_id='artifact', idempotency_key='stable'))
            if name == 'brand_workflow_send_result':
                self.results.append(args['p'])
            return SimpleNamespace(data=1)
        return SimpleNamespace(execute=execute)


def test_scheduler_is_opt_in_and_bounded():
    gw = Gateway()
    assert module().scheduler_tick(gw, enabled=False) == 0
    assert gw.calls == []
    assert module().scheduler_tick(gw, enabled=True) == 1
    assert gw.calls == [('brand_workflow_tick', {'p': {'limit': 10}}), ('brand_workflow_collect_reviews', {'p': {'limit': 10}})]


def test_ambiguous_mail_is_recorded_never_replayed():
    gw = Gateway()
    calls = []
    class Mail:
        def send(self, **kwargs):
            calls.append(kwargs)
            raise TimeoutError('may have reached provider')
    assert module().deliver_one(gw, 'delivery', mail=Mail(), origin='https://alm.example.invalid') == 'reconciling'
    assert calls[0]['idempotency_key'] == 'stable'
    assert calls[0]['url'] == 'https://alm.example.invalid/workflow-artifacts/11111111-1111-4111-8111-111111111111'
    assert gw.results == [dict(delivery_id='delivery', status='reconciling', provider_receipt=None)]
    with pytest.raises(ValueError):
        module().deliver_one(gw, 'delivery', mail=Mail(), origin='https://alm.example.invalid')
    assert len(calls) == 1


def test_revocation_and_missing_mail_never_call_provider():
    gw = Gateway()
    gw.revoked = True
    class Mail:
        def send(self, **kwargs):
            pytest.fail('forbidden email')
    with pytest.raises(ValueError):
        module().deliver_one(gw, 'delivery', mail=Mail(), origin='https://alm.example.invalid')
    gw.calls.clear()
    assert module().deliver_one(gw, 'delivery', mail=None, origin='https://alm.example.invalid') == 'mail_unavailable'
    assert not gw.calls


def test_success_persists_acceptance_receipt():
    gw = Gateway()
    class Mail:
        def send(self, **kwargs):
            return 'offline-accepted'
    assert module().deliver_one(gw, 'delivery', mail=Mail(), origin='https://alm.example.invalid') == 'sent'
    assert gw.results[0]['provider_receipt'] == 'offline-accepted'


def test_real_loop_invokes_scheduler_only_when_configured(monkeypatch):
    from auditlayer_worker import worker
    from test_worker_recovery import loop_harness
    settings, gateway, runtime, health = loop_harness(monkeypatch)
    monkeypatch.setattr(worker, '_drain_once', lambda *args, **kwargs: False)
    calls=[]
    monkeypatch.setattr(module(), 'scheduler_tick', lambda gateway, *, enabled: calls.append(enabled))
    monkeypatch.setenv('ALM_BRAND_WORKFLOWS_ENABLED', '1')
    worker.run_worker_loop(settings, once=True)
    assert calls == [True]
    calls.clear()
    monkeypatch.delenv('ALM_BRAND_WORKFLOWS_ENABLED')
    worker.run_worker_loop(settings, once=True)
    assert calls == [False]
