"""Regression boundaries: real pipeline/gateway, deterministic database transport."""
from dataclasses import replace
from types import SimpleNamespace

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import AuditRecord
from auditlayer_worker.generation import GenerationStageError
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink
from auditlayer_worker.supabase_client import SupabaseGateway


class Query:
    def __init__(self, client, table):
        self.client, self.table = client, table
        self.filters = []
        self.count = None

    def select(self, *_): return self
    def order(self, *_, **__): return self
    def eq(self, key, value):
        self.filters.append((key, value))
        return self
    def limit(self, count):
        self.count = count
        return self
    def execute(self):
        rows = self.client.rows.get(self.table, [])
        rows = [r for r in rows if all(r.get(k) == v for k, v in self.filters)]
        return SimpleNamespace(data=rows[:self.count])


class Client:
    def __init__(self, rows): self.rows = rows
    def table(self, name): return Query(self, name)


def retained_rows():
    return {
        'instagram_connections': [],
        'audits': [{'id': 'audit', 'user_id': 'owner', 'account_id': 'account'}],
        'accounts': [{'id': 'account', 'user_id': 'owner', 'platform': 'instagram',
                      'handle': 'renamed', 'ownership_status': 'connected',
                      'instagram_user_id': 123, 'ig_connection_id': None}],
    }


def test_claim_before_disconnect_lookup_after_disconnect_cannot_restore_cache(monkeypatch, tmp_path):
    audit = AuditRecord(id='audit', user_id='owner', handle='oldname', platform='instagram',
                        goal='growth', plan='starter', status='running',
                        research_cache='captured-before-disconnect')
    rows = retained_rows()
    # Claim above captured private research. Disconnect purges database caches
    # and credentials but keeps the stable owner/audit/account association.
    rows['audits'][0]['research_cache'] = ''
    gateway = object.__new__(SupabaseGateway)
    gateway.client = Client(rows)
    updates = []
    gateway.update_audit = lambda _id, **fields: updates.append(fields)
    gateway.emit_event = lambda *a, **kw: None
    monkeypatch.setattr('auditlayer_worker.pipeline._fetch_benchmark_cache', lambda _: [])

    class Generator:
        def generate(self, audit, progress, *, research_cache, ig_future, **kwargs):
            assert research_cache == 'captured-before-disconnect'
            try:
                ig_future.result(timeout=2)
            finally:
                raise GenerationStageError(stage='analysis', error_code='retry', retryable=True,
                                           research_cache=research_cache)

    settings = replace(WorkerSettings.from_env(), output_dir=tmp_path,
                       alm_accounts_root=str(tmp_path / 'accounts'), phase_interval_seconds=0)
    sink = PrintEventSink()
    summary = GenerationPipeline(settings, Generator()).run(audit, sink, gateway=gateway)
    assert summary.status == 'failed'
    assert not any('research_cache' in fields for fields in updates)
    assert not any('Using verified public' in detail for _, _, detail in sink.events)
    assert any('must be reconnected' in detail for _, _, detail in sink.events)


@pytest.mark.parametrize('outcome', ['success', 'committed_timeout', 'no_version', 'unavailable', 'conflict'])
def test_initial_finalization_real_gateway_pipeline_boundary(outcome, monkeypatch, tmp_path):
    import httpx
    from unittest.mock import MagicMock
    from auditlayer_worker.generation import MockReportGenerator

    audit = AuditRecord(id='initial', handle='creator', platform='youtube', goal='growth',
                        plan='starter', status='running')
    gateway = object.__new__(SupabaseGateway)
    gateway.client = MagicMock()
    updates, calls = [], []
    state = {'status': 'running', 'versions': []}

    def execute_rpc(name, payload):
        assert name == 'finalize_initial_report'
        calls.append(payload)
        if outcome in {'success', 'committed_timeout', 'conflict'}:
            state['status'] = payload['p_delivery_status']
            state['versions'].append({
                'version': 1,
                **{k.removeprefix('p_'): v for k, v in payload.items()},
            })
        if outcome == 'success':
            return SimpleNamespace(data=1)
        raise httpx.ReadTimeout('response lost')

    gateway.client.rpc.side_effect = lambda name, payload: SimpleNamespace(
        execute=lambda: execute_rpc(name, payload))

    def readback():
        query = gateway.client.table.return_value
        assert query.eq.call_args_list[0].args == ('audit_id', audit.id)
        assert query.eq.return_value.eq.call_args.args == ('report_path', 'initial/unique.html')
        if outcome == 'unavailable':
            raise httpx.ReadTimeout('readback unavailable')
        if outcome == 'conflict':
            state['versions'][0]['prompt_version'] = 'other'
        return SimpleNamespace(data=state['versions'])

    version_query = gateway.client.table.return_value
    gateway.client.table.side_effect = lambda name: (
        version_query if name == 'audit_report_versions' else Query(Client({}), name))
    gateway.client.table.return_value.select.return_value = gateway.client.table.return_value
    gateway.client.table.return_value.eq.return_value.eq.return_value.limit.return_value.execute.side_effect = readback
    gateway.upload_report = lambda *a, **kw: ('initial/unique.html', '')
    def update(audit_id, **fields):
        updates.append(fields)
        state.update(fields)
    gateway.update_audit = update
    # Keep telemetry separate so only the actual finalization RPC is simulated.
    gateway.start_report_generation_run = lambda **kw: None
    monkeypatch.setattr('auditlayer_worker.pipeline._fetch_benchmark_cache', lambda _: [])
    settings = replace(WorkerSettings.from_env(), output_dir=tmp_path,
                       alm_accounts_root=str(tmp_path / 'accounts'), phase_interval_seconds=0)
    summary = GenerationPipeline(settings, MockReportGenerator()).run(audit, PrintEventSink(), gateway=gateway)
    assert len(calls) == 1  # no blind replay, even when no version is visible yet
    assert not any(fields.get('status') == 'failed' for fields in updates)
    if outcome in {'success', 'committed_timeout'}:
        assert summary.status in {'ready', 'needs_review'}
        assert state['status'] == summary.status
        assert len(state['versions']) == 1
    else:
        assert summary.status == 'running'
        assert 'unknown' in summary.note


@pytest.mark.parametrize('eligible', [False, True])
def test_connected_benchmark_filters_before_limit_and_skips_unusable(eligible):
    from datetime import datetime, timezone
    from auditlayer_worker.benchmark import _connected_company_case

    base = dict(user_id='owner', ig_username='auditlayermedia', is_active=True,
                connection_status='connected', graph_api_family='instagram',
                long_lived_expires_at='2099-01-01T00:00:00+00:00')
    rows = [{**base, **bad} for bad in [
        {'long_lived_expires_at': '2000-01-01T00:00:00+00:00'},
        {'connection_status': 'reconnect_required'},
        {'graph_api_family': 'facebook'}, {'graph_api_family': None},
        {'is_active': False}, {'ig_username': 'customer'},
    ]]
    if eligible:
        rows.append({**base, 'user_id': 'usable-owner'})

    class BenchmarkQuery(Query):
        def gt(self, key, value):
            assert self.count is None  # eligibility before LIMIT
            assert key == 'long_lived_expires_at'
            assert abs((datetime.now(timezone.utc) - datetime.fromisoformat(value)).total_seconds()) < 5
            self.cutoff = value
            return self
        def execute(self):
            candidates = [r for r in rows if all(r.get(k) == v for k, v in self.filters)]
            if hasattr(self, 'cutoff'):
                candidates = [r for r in candidates if r['long_lived_expires_at'] > self.cutoff]
            return SimpleNamespace(data=candidates[:self.count])

    query = BenchmarkQuery(None, 'instagram_connections')
    result = _connected_company_case(SimpleNamespace(client=SimpleNamespace(table=lambda _: query)))
    if eligible:
        assert result.user_id == 'usable-owner'
    else:
        assert result is None


@pytest.mark.parametrize('case,expected', [
    ('stable_renamed', 'reconnect_required'),
    ('managed_handle', 'reconnect_required'),
    ('public', 'not_found'), ('foreign_account', 'not_found'),
    ('foreign_audit', 'not_found'),
])
def test_identity_lookup_real_postgrest_boundary(case, expected):
    import httpx
    from postgrest import SyncPostgrestClient

    rows = retained_rows()
    audit_id = 'audit'
    handle = 'oldname'
    if case == 'managed_handle':
        audit_id, handle = None, 'renamed'
    elif case == 'public':
        rows['accounts'][0].update(ownership_status='observed', instagram_user_id=None)
    elif case == 'foreign_account':
        rows['accounts'][0]['user_id'] = 'other'
    elif case == 'foreign_audit':
        rows['audits'][0]['user_id'] = 'other'
    requests = []

    def transport(request):
        requests.append(request)
        table = request.url.path.rsplit('/', 1)[-1]
        params = dict(request.url.params)
        assert params['user_id'] == 'eq.owner'
        result = rows[table]
        for key, value in params.items():
            if value.startswith('eq.'):
                result = [r for r in result if str(r.get(key)) == value[3:]]
        return httpx.Response(200, json=result[:int(params['limit'])])

    with httpx.Client(transport=httpx.MockTransport(transport)) as http:
        gateway = object.__new__(SupabaseGateway)
        gateway.client = SyncPostgrestClient('http://fixture.invalid', http_client=http)
        lookup = gateway.get_instagram_token(handle, 'owner', audit_id=audit_id)
    assert lookup.state.value == expected
    if case == 'stable_renamed':
        assert dict(requests[-1].url.params)['id'] == 'eq.account'
        assert 'handle' not in requests[-1].url.params
