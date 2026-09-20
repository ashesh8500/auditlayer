"""Real SQL in an explicitly isolated container, never a linked Supabase DB."""
import json
import os
from pathlib import Path
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = os.environ.get('ALM_DRAIN_TEST_CONTAINER', '')
TOKEN = '00000000-0000-0000-0000-000000000001'

@unittest.skipUnless(CONTAINER.startswith('alm-drain-test-'), 'isolated container required')
class DrainSQL(unittest.TestCase):
    @classmethod
    def command(cls):
        return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', cls.db, '-v', 'ON_ERROR_STOP=1', '-Atq']

    @classmethod
    def sql(cls, text, check=True):
        return subprocess.run(cls.command(), input=text, text=True, capture_output=True, check=check)

    @classmethod
    def setUpClass(cls):
        cls.db = 'drain_' + uuid.uuid4().hex
        subprocess.run(['docker', 'exec', CONTAINER, 'createdb', '-U', 'postgres', cls.db], check=True)
        cls.sql("""do $$ begin create role anon; create role authenticated; create role service_role; exception when duplicate_object then null; end $$;
        create table audits(id uuid primary key default gen_random_uuid(), status text, created_at timestamptz default now(), updated_at timestamptz default now(), report_version integer default 1, report_path text);
        create table refinements(id uuid primary key default gen_random_uuid(), audit_id uuid, status text, created_at timestamptz default now(), updated_at timestamptz default now());""")
        migrations = ROOT / 'supabase/migrations'
        cls.sql((migrations / '0016_claim_rpc.sql').read_text())
        cls.sql(next(migrations.glob('*_refinement_lifecycle.sql')).read_text())
        cls.sql(next(migrations.glob('*_worker_fleet_drain.sql')).read_text())

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['docker', 'exec', CONTAINER, 'dropdb', '-U', 'postgres', cls.db], check=True)

    def setUp(self):
        self.sql('truncate audits, refinements;')

    def test_pause_blocks_both_queues_and_resume_preserves_work(self):
        self.sql("insert into audits(status) values ('queued'); insert into audits(status,report_path) values ('ready','report'); insert into refinements(audit_id,status) select id,'queued' from audits where status='ready';")
        result = self.sql(f"select pause_worker_claims('{TOKEN}');", check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.sql("select claim_next_queued('worker-1') is null, claim_next_refinement('worker-2') is null;").stdout.strip(), 't|t')
        self.sql(f"select resume_worker_claims('{TOKEN}');")
        self.assertEqual(self.sql("select claim_next_queued('worker-1')->>'status', claim_next_refinement('worker-2')->>'status';").stdout.strip(), 'running|running')
        self.sql(f"select pause_worker_claims('{TOKEN}');")
        state = json.loads(self.sql('select worker_drain_status();').stdout)
        self.assertEqual((state['active_audits'], state['active_refinements']), (1, 1))
        self.sql(f"select resume_worker_claims('{TOKEN}');")

    def wait_for_lock(self, name):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.sql(f"select count(*) from pg_stat_activity where datname=current_database() and application_name='{name}' and wait_event_type='Lock';").stdout.strip() == '1':
                return
            time.sleep(0.02)
        self.fail('contender never reached lock barrier')

    def session(self):
        process = subprocess.Popen(self.command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.addCleanup(process.stderr.close)
        self.addCleanup(process.stdout.close)
        self.addCleanup(process.stdin.close)
        self.addCleanup(lambda: process.kill() if process.poll() is None else None)
        return process

    def test_pause_waits_for_committing_claim_and_post_pause_claim_waits(self):
        self.sql("insert into audits(status) values ('queued'),('queued');")
        claimant = self.session()
        claimant.stdin.write("begin; select claim_next_queued('worker-1')->>'status';\n"); claimant.stdin.flush()
        self.assertEqual(claimant.stdout.readline().strip(), 'running')
        pause = self.session()
        pause.stdin.write(f"set application_name='pause_barrier'; select pause_worker_claims('{TOKEN}');\n"); pause.stdin.flush()
        self.wait_for_lock('pause_barrier')
        claimant.stdin.write('commit;\n'); claimant.stdin.flush()
        self.assertEqual(pause.stdout.readline().strip(), '')
        self.assertEqual(self.sql("select claim_next_queued('worker-2') is null;").stdout.strip(), 't')
        self.assertEqual(json.loads(self.sql('select worker_drain_status();').stdout)['active_audits'], 1)
        self.sql(f"select resume_worker_claims('{TOKEN}');")
        # Reverse ordering: pause owns its transaction lock before a claim starts.
        pause.stdin.write(f"begin; select pause_worker_claims('{TOKEN}');\n"); pause.stdin.flush()
        self.assertEqual(pause.stdout.readline().strip(), '')
        claimant.stdin.write("set application_name='claim_barrier'; select claim_next_queued('worker-2') is null;\n"); claimant.stdin.flush()
        self.wait_for_lock('claim_barrier')
        pause.stdin.write('commit;\n'); pause.stdin.flush()
        self.assertEqual(claimant.stdout.readline().strip(), 't')
        self.sql(f"select resume_worker_claims('{TOKEN}');")
        for process in (pause, claimant):
            process.stdin.write('\\q\n'); process.stdin.flush(); process.wait(timeout=5)

    def test_refinement_claim_transactions_obey_same_pause_barrier(self):
        self.sql("insert into audits(status,report_path) values ('ready','report'); insert into refinements(audit_id,status) select id,'queued' from audits;")
        claimant = self.session()
        pause = self.session()
        assert claimant.stdin and claimant.stdout and pause.stdin and pause.stdout
        claimant.stdin.write("begin; select claim_next_refinement('worker-2')->>'status';\n"); claimant.stdin.flush()
        self.assertEqual(claimant.stdout.readline().strip(), 'running')
        pause.stdin.write(f"set application_name='refinement_pause'; select pause_worker_claims('{TOKEN}');\n"); pause.stdin.flush()
        self.wait_for_lock('refinement_pause')
        claimant.stdin.write('commit;\n'); claimant.stdin.flush()
        self.assertEqual(pause.stdout.readline().strip(), '')
        self.assertEqual(json.loads(self.sql('select worker_drain_status();').stdout)['active_refinements'], 1)
        self.sql(f"select resume_worker_claims('{TOKEN}');")
        for process in (pause, claimant):
            assert process.stdin
            process.stdin.write('\\q\n'); process.stdin.flush(); process.wait(timeout=5)

    def test_token_ownership_permissions_and_fail_closed_missing_control(self):
        other = '00000000-0000-0000-0000-000000000002'
        self.sql(f"select pause_worker_claims('{TOKEN}'); select pause_worker_claims('{TOKEN}');")
        for rpc in ('pause_worker_claims', 'resume_worker_claims'):
            self.assertNotEqual(self.sql(f"select {rpc}('{other}');", False).returncode, 0)
            for role in ('anon', 'authenticated'):
                self.assertIn('permission denied', self.sql(f"set role {role}; select {rpc}('{TOKEN}');", False).stderr)
        self.assertIn('permission denied', self.sql('set role anon; select worker_drain_status();', False).stderr)
        self.assertIn('permission denied', self.sql('set role service_role; update worker_claim_control set drain_token=null;', False).stderr)
        self.assertEqual(self.sql('set role service_role; select claim_next_queued(\'test\') is null;').stdout.strip(), 't')
        self.sql(f"select resume_worker_claims('{TOKEN}');")
        self.sql('delete from worker_claim_control;')
        for rpc in ('claim_next_queued', 'claim_next_refinement'):
            self.assertIn('drain_control_missing', self.sql(f"select {rpc}('worker-1');", False).stderr)
        self.sql('insert into worker_claim_control(singleton) values(true);')

if __name__ == '__main__':
    unittest.main()
