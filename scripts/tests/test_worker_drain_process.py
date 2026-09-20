"""Isolated real CLI process + loopback HTTP + fake systemd; no production calls."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import unittest

ROOT = Path(__file__).resolve().parents[2]
TOKEN = '00000000-0000-0000-0000-000000000001'

class DrainProcess(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.log = self.path / 'events'
        self.paused = False
        self.polls = 0
        self.busy = False
        self.bad_health = False
        self.health_override = None
        self.health_http_status = 200
        self.api_error = False
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args): pass
            def do_GET(self):
                data = {'status': 'ok', 'service': 'auditlayer-worker', 'active_job_kind': 'audit' if owner.busy else None}
                if owner.bad_health: data = {'status': 'ok'}
                if owner.health_override is not None: data = owner.health_override
                self.send_response(owner.health_http_status); self.end_headers(); self.wfile.write(json.dumps(data).encode())
            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                method = self.path.rsplit('/', 1)[-1]
                with owner.log.open('a') as log: log.write(method+'\n')
                if owner.api_error:
                    self.send_response(503); self.end_headers(); return
                if method == 'pause_worker_claims': owner.paused = True
                if method == 'resume_worker_claims': owner.paused = False
                owner.polls += method == 'worker_drain_status'
                data = {'paused': owner.paused, 'drain_token': TOKEN if owner.paused else None,
                        'active_audits': int(owner.polls < 3), 'active_refinements': 0} if method == 'worker_drain_status' else None
                self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(data).encode())
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True); thread.start()
        self.addCleanup(self.server.server_close); self.addCleanup(self.server.shutdown)
        systemctl = self.path / 'systemctl'
        systemctl.write_text('''#!/usr/bin/env python3
import os, pathlib, sys
p = pathlib.Path(os.environ['FIXTURE_DIR'])
a = sys.argv[1:]
if a[0] in ('is-active','is-enabled'): sys.exit(1)
if a[0] == 'list-units':
    print('auditlayer-worker@1.service loaded active running\\nauditlayer-worker@2.service loaded active running')
    if (p/'extra-unit').exists(): print('auditlayer-worker@3.service loaded active running')
if a[0] == 'show': print('inactive' if (p/'stopped').exists() else 'active')
if a[0] == 'stop':
    (p/'stopped').touch()
    with (p/'events').open('a') as f: f.write('STOP '+ ' '.join(a[1:])+'\\n')
''')
        systemctl.chmod(0o755)
        sudo = self.path / 'sudo'; sudo.write_text('#!/bin/sh\nexec "$@"\n'); sudo.chmod(0o755)
        base = f'http://127.0.0.1:{self.server.server_port}'
        self.env = {**os.environ, 'PATH': str(self.path)+':'+os.environ['PATH'], 'FIXTURE_DIR': str(self.path),
                    'SUPABASE_URL': base, 'SUPABASE_SERVICE_ROLE_KEY': 'fixture-only', 'DRAIN_TOKEN': TOKEN,
                    'ALM_DRAIN_HEALTH_URLS': base+'/one,'+base+'/two'}

    def run_hook(self, action='drain'):
        return subprocess.run(['python3', str(ROOT/'worker/infra/drain.py'), action, '--env-file', '', '--timeout', '2', '--poll-seconds', '0.01'], env=self.env, text=True, capture_output=True, timeout=5)

    def test_waits_for_database_then_stops_only_two_units_and_keeps_pause(self):
        result = self.run_hook()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.paused)
        events = self.log.read_text().splitlines()
        self.assertEqual(events[0], 'pause_worker_claims')
        self.assertEqual([e for e in events if e.startswith('STOP')], ['STOP auditlayer-worker@1.service auditlayer-worker@2.service'])
        self.assertGreaterEqual(events.count('worker_drain_status'), 3)
        self.assertEqual(self.run_hook('verify').returncode, 0)

    def test_legacy_service_key_environment_alias_is_supported(self):
        self.env['SUPABASE_SERVICE_KEY'] = self.env.pop('SUPABASE_SERVICE_ROLE_KEY')
        result = self.run_hook()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_database_error_never_stops(self):
        self.api_error = True
        self.assertNotEqual(self.run_hook().returncode, 0)
        self.assertFalse((self.path/'stopped').exists())

    def test_busy_local_process_is_not_mistaken_for_reaped_database_job(self):
        self.busy = True
        self.assertNotEqual(self.run_hook().returncode, 0)
        self.assertTrue(self.paused)
        self.assertFalse((self.path/'stopped').exists())

    def test_missing_active_job_health_evidence_fails_closed(self):
        self.bad_health = True
        self.assertNotEqual(self.run_hook().returncode, 0)
        self.assertTrue(self.paused)
        self.assertFalse((self.path/'stopped').exists())

    def test_resume_is_explicit_and_verified(self):
        self.assertEqual(self.run_hook().returncode, 0)
        (self.path/'stopped').unlink()  # Explicit reviewed fleet startup before resume.
        result = self.run_hook('resume')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.paused)

    def assert_resume_refused(self):
        result = self.run_hook('resume')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertTrue(self.paused)
        self.assertNotIn('resume_worker_claims', self.log.read_text().splitlines())

    def test_resume_refuses_stopped_workers(self):
        self.assertEqual(self.run_hook().returncode, 0)
        self.assert_resume_refused()

    def test_resume_refuses_unhealthy_or_wrong_service_payloads(self):
        for health in (
            {'status': 'ok'},
            {'status': 'degraded', 'service': 'auditlayer-worker', 'active_job_kind': None},
            {'status': 'ok', 'service': 'unrelated-service', 'active_job_kind': None},
            {'status': 'ok', 'service': 'auditlayer-worker', 'active_job_kind': 'refinement'},
            [],
        ):
            with self.subTest(health=health):
                self.paused = True
                self.polls = 3
                self.log.write_text('')
                self.health_override = health
                self.assert_resume_refused()

    def test_resume_refuses_missing_health_endpoint(self):
        self.paused = True
        self.polls = 3
        self.health_http_status = 404
        self.assert_resume_refused()

    def test_resume_refuses_unreviewed_topology(self):
        self.paused = True
        self.polls = 3
        (self.path/'extra-unit').touch()
        self.assert_resume_refused()

    def test_resume_refuses_outstanding_global_claims(self):
        self.paused = True
        self.polls = 0
        self.assert_resume_refused()

    def test_resume_requires_two_distinct_health_endpoints(self):
        self.paused = True
        self.polls = 3
        endpoint = self.env['ALM_DRAIN_HEALTH_URLS'].split(',')[0]
        self.env['ALM_DRAIN_HEALTH_URLS'] = endpoint + ',' + endpoint
        self.assert_resume_refused()

    def test_verify_cannot_pause_or_stop_an_active_fleet(self):
        self.assertNotEqual(self.run_hook('verify').returncode, 0)
        self.assertFalse(self.paused)
        self.assertFalse((self.path/'stopped').exists())

if __name__ == '__main__': unittest.main()
