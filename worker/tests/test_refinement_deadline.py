"""Real process/lock containment with fake providers; no network or database."""
import multiprocessing
import json
import os
import signal
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from auditlayer_worker import hermes_inprocess as hip, worker


def bounded():
    function = getattr(hip, 'run_bounded_refinement', None)
    assert callable(function), 'refinement needs a killable total-deadline boundary'
    return function


def assert_lock_released():
    result = []
    def acquire():
        acquired = hip.HERMES_HOME_LOCK.acquire(timeout=.2)
        result.append(acquired)
        if acquired:
            hip.HERMES_HOME_LOCK.release()
    thread = threading.Thread(target=acquire)
    thread.start()
    thread.join(1)
    assert result == [True]


def test_stubborn_provider_is_killed_and_reaped_without_replay(tmp_path, monkeypatch):
    run = bounded()
    marker = tmp_path / 'calls'
    class Agent:
        def __init__(self, **kw):
            assert kw['provider'] == 'deepseek' and kw['enabled_toolsets'] == []
            assert kw['skip_memory'] and kw['skip_context_files']
        def run_conversation(self, *args, **kwargs):
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            marker.write_text(str(os.getpid()))
            while True:
                time.sleep(.01)
    monkeypatch.setitem(sys.modules, 'run_agent', SimpleNamespace(AIAgent=Agent, IterationBudget=lambda n: SimpleNamespace(used=0, max_total=n)))
    client = object.__new__(hip.InProcessHermesClient)
    client.settings = SimpleNamespace(hermes_provider='deepseek')
    client._hermes_home = None
    client._max_iterations = 2
    client._skip_memory = True
    before = {p.pid for p in multiprocessing.active_children()}
    started = time.monotonic()
    with pytest.raises(TimeoutError):
        run(lambda: client.chat([], 'deepseek-v4-flash', stream=False), deadline=started + .25)
    assert time.monotonic() - started < 2
    pid = int(marker.read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)
    assert {p.pid for p in multiprocessing.active_children()} == before
    assert_lock_released()


def test_process_setup_failure_releases_lock(monkeypatch):
    run = bounded()
    def fail():
        raise OSError('pipe resources exhausted')
    monkeypatch.setattr(hip.multiprocessing, 'get_context', lambda _: SimpleNamespace(Pipe=lambda **kw: fail()))
    try:
        with pytest.raises(OSError):
            run(lambda: True, deadline=time.monotonic() + 1)
        assert_lock_released()
    finally:
        # Clean up the RED implementation's leaked acquisition, if present.
        try:
            hip.HERMES_HOME_LOCK.release()
        except RuntimeError:
            pass


def test_lock_wait_consumes_budget_and_never_starts_child(tmp_path):
    run = bounded()
    held, release = threading.Event(), threading.Event()
    def holder():
        with hip.HERMES_HOME_LOCK:
            held.set()
            release.wait(2)
    thread = threading.Thread(target=holder)
    thread.start()
    assert held.wait(1)
    marker = tmp_path / 'must-not-start'
    start = time.monotonic()
    try:
        with pytest.raises(TimeoutError):
            run(lambda: marker.write_text('bad'), deadline=start + .05)
        assert time.monotonic() - start < .5
        assert not marker.exists()
    finally:
        release.set()
        thread.join(1)
    assert_lock_released()


def test_worker_bounds_entire_attempt_to_lease_reserve(monkeypatch):
    captured = []
    def run(operation, *, deadline):
        captured.append(deadline - time.monotonic())
        return True
    assert hasattr(worker, 'run_bounded_refinement'), 'whole refinement attempt must be bounded'
    monkeypatch.setattr(worker, 'run_bounded_refinement', run)
    row = {'id': 'r', 'audit_id': 'a', 'lease_expires_at': (datetime.now(timezone.utc) + timedelta(seconds=240)).isoformat()}
    assert worker._process_refinement(None, None, None, row)
    assert 0 < captured[0] <= 60  # three minutes reserved before SQL expiry
    row['lease_expires_at'] = (datetime.now(timezone.utc) + timedelta(seconds=100)).isoformat()
    assert worker._process_refinement(None, None, None, row) is False
    assert len(captured) == 1


def test_hanging_persistence_cannot_outlive_whole_job_deadline(tmp_path, monkeypatch):
    bounded()
    assert hasattr(worker, '_refinement_child_attempt'), 'isolate entire attempt, not just conversation'
    marker = tmp_path / 'persisted-usage'
    def attempt(*args):
        marker.write_text('reported:42:7')
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        while True:
            time.sleep(.01)
    monkeypatch.setattr(worker, '_refinement_child_attempt', attempt)
    monkeypatch.setattr(worker, 'REFINEMENT_TOTAL_SECONDS', .15)
    row = {'id': 'r', 'audit_id': 'a', 'lease_expires_at': (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()}
    assert worker._process_refinement(None, None, None, row) is False
    assert marker.read_text() == 'reported:42:7'  # never overwritten with invented zero
    assert_lock_released()


@pytest.mark.parametrize('outcome', ['success', 'invalid', 'unknown', 'finalize_hang', 'download_hang', 'ambiguous'])
def test_real_attempt_keeps_durable_usage_and_ambiguous_commit_state(tmp_path, monkeypatch, outcome):
    """Run the real worker attempt inside its real process supervisor.

    Only the DB/provider boundaries are fake; files represent committed state
    visible across the fork, unlike a parent-side Mock call list.
    """
    from auditlayer_worker.generation import GenerationStageError
    state_path = tmp_path / 'state.json'
    calls_path = tmp_path / 'calls'
    state_path.write_text(json.dumps({'status': 'running', 'tokens_in': None, 'tokens_out': None, 'cost_usd': None}))
    audit = {'id': 'a', 'handle': 'fixture', 'report_version': 1, 'report_path': 'old.html'}
    class Query:
        def __getattr__(self, name):
            return lambda *a, **kw: self
        def execute(self):
            return SimpleNamespace(data=[audit])
    class Gateway:
        client = SimpleNamespace(table=lambda *a: Query())
        def get_app_settings(self):
            return None
        def update_refinement(self, _id, **fields):
            state = json.loads(state_path.read_text())
            state.update(fields)
            state_path.write_text(json.dumps(state))
        def upload_report(self, *a):
            return 'new.html', ''
        def finalize_refinement_report(self, **kw):
            if outcome == 'finalize_hang':
                signal.signal(signal.SIGTERM, signal.SIG_IGN)
                while True:
                    time.sleep(.01)
            self.update_refinement('r', status='done')
            if outcome == 'ambiguous':
                raise RuntimeError('response lost after commit')
            return 2
        def emit_event(self, *a, **kw):
            pass
    class Pipeline:
        def refine(self, *a, **kw):
            with calls_path.open('a') as f:
                f.write('one provider attempt\n')
            if outcome == 'unknown':
                raise RuntimeError('transport failed with no response')
            if outcome == 'invalid':
                exc = GenerationStageError(stage='refinement', error_code='invalid', retryable=False, tokens_in=42, tokens_out=7)
                exc.usage_estimated = False
                raise exc
            kw['usage_callback'](42, 7, False)
            return '<html>new</html>', 42, 7
    def download(*a):
        if outcome == 'download_hang':
            while True:
                time.sleep(.01)
        return '<html>old</html>'
    monkeypatch.setattr(worker, 'SupabaseGateway', lambda settings: Gateway())
    monkeypatch.setattr(worker, 'HermesRuntime', lambda settings: SimpleNamespace(shutdown=lambda: None))
    monkeypatch.setattr(worker, 'build_generator', lambda *a, **kw: None)
    monkeypatch.setattr(worker, 'GenerationPipeline', lambda *a: Pipeline())
    monkeypatch.setattr(worker, '_download_report', download)
    monkeypatch.setattr(worker, 'get_report_bundle_version', lambda *a: 'test')
    monkeypatch.setattr(worker, 'REFINEMENT_TOTAL_SECONDS', .2)
    settings = SimpleNamespace(alm_profile_bundle_root=tmp_path, price_in_per_mtok=.14, price_out_per_mtok=.28)
    row = {'id': 'r', 'audit_id': 'a', 'section': 'Key Gaps', 'base_report_version': 1,
           'lease_expires_at': (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()}
    assert worker._process_refinement(settings, None, None, row) is (outcome == 'success')
    state = json.loads(state_path.read_text())
    expected_status = {'success': 'done', 'ambiguous': 'done', 'invalid': 'failed', 'unknown': 'failed', 'finalize_hang': 'running', 'download_hang': 'running'}
    assert state['status'] == expected_status[outcome]
    if outcome in {'unknown', 'download_hang'}:
        assert state['tokens_in'] is None and state['cost_usd'] is None
    else:
        assert (state['tokens_in'], state['tokens_out']) == (42, 7)
        assert state['usage_status'] == 'reported' and state['usage_estimated'] is False
        assert state['cost_usd'] == worker.estimate_cost(42, 7, .14, .28, data_api_allowance_usd=0).total_usd
    assert (calls_path.read_text().count('one provider attempt') if calls_path.exists() else 0) == (0 if outcome == 'download_hang' else 1)
    assert_lock_released()
