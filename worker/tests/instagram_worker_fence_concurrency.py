"""Real multi-session PG regression; run explicitly, never touches hosted DB.

ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' python tests/instagram_worker_fence_concurrency.py
"""
import os
import shlex
import subprocess
import time
import unittest
from uuid import uuid4


class FenceConcurrency(unittest.TestCase):
    def setUp(self):
        self.command = shlex.split(os.environ['ALM_TEST_PSQL']) + ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
        self.owner = str(uuid4())
        self.audit = str(uuid4())
        self.children = []
        result = self.sql(f"""
            insert into auth.users(id,email) values('{self.owner}','fence-{self.owner}@example.invalid');
            insert into public.profiles(id) values('{self.owner}') on conflict do nothing;
            select connection_id from public.persist_instagram_connection('{self.owner}',990101::bigint,'race_fence','fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
        """)
        self.connection = result.strip()
        self.version = self.sql(f"select credential_version from public.instagram_connections where id='{self.connection}';").strip()
        self.sql(f"insert into public.audits(id,user_id,handle,platform,account_id) select '{self.audit}','{self.owner}','race_fence','instagram',id from public.accounts where ig_connection_id='{self.connection}';")

    def tearDown(self):
        for child in self.children:
            if child.poll() is None:
                child.kill()
            child.communicate(timeout=5)
        self.sql(f"delete from auth.users where id='{self.owner}';")

    def sql(self, sql):
        result = subprocess.run(self.command, input=sql, text=True, capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def session(self, sql):
        child = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.children.append(child)
        assert child.stdin is not None
        child.stdin.write(sql + '\n')
        child.stdin.flush()
        return child

    def wait_for_lock(self, name):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if self.sql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';").strip() == '1':
                return
            time.sleep(0.02)
        self.fail('second session did not demonstrably block on the owner lock')

    def write(self):
        return f"select public.write_instagram_worker_state('{self.owner}','{self.connection}','{self.version}','progression','{{\"audit_id\":\"{self.audit}\",\"followers\":999,\"research_snapshot\":\"sensitive\",\"research_refreshed\":true}}') is null;"

    def disconnect(self):
        return f"select public.disconnect_instagram_connection('{self.owner}','{self.connection}');"

    def assert_purged(self):
        self.assertEqual(self.sql(f"select count(*) from public.accounts where user_id='{self.owner}' and (research_snapshot is not null or ig_connection_id is not null);").strip(), '0')
        self.assertEqual(self.sql(f"select count(*) from public.account_progression where audit_id='{self.audit}' and followers is not null;").strip(), '0')
        self.assertEqual(self.sql(f"select research_cache='' from public.audits where id='{self.audit}';").strip(), 't')

    def test_disconnect_commits_before_waiting_worker(self):
        first = self.session('begin; set local role service_role; ' + self.disconnect() + '\n\\echo LOCKED')
        assert first.stdout is not None and first.stdin is not None
        while first.stdout.readline().strip() != 'LOCKED':
            self.assertIsNone(first.poll())
        name = 'worker-fence-' + self.owner
        second = self.session(f"set application_name='{name}'; set role service_role; " + self.write())
        self.wait_for_lock(name)
        first.stdin.write('commit;\n\\q\n'); first.stdin.flush()
        first.communicate(timeout=10)
        output, error = second.communicate(timeout=10)
        self.assertEqual(second.returncode, 0, error)
        self.assertEqual(output.strip(), 't')  # rejected, not stale success
        self.assert_purged()

    def test_worker_commits_before_waiting_disconnect(self):
        first = self.session('begin; set local role service_role; ' + self.write() + '\n\\echo LOCKED')
        assert first.stdout is not None and first.stdin is not None
        self.assertEqual(first.stdout.readline().strip(), 'f')  # valid write
        self.assertEqual(first.stdout.readline().strip(), 'LOCKED')
        name = 'disconnect-fence-' + self.owner
        second = self.session(f"set application_name='{name}'; set role service_role; " + self.disconnect())
        self.wait_for_lock(name)
        first.stdin.write('commit;\n\\q\n'); first.stdin.flush()
        first.communicate(timeout=10)
        output, error = second.communicate(timeout=10)
        self.assertEqual(second.returncode, 0, error)
        self.assert_purged()


if __name__ == '__main__':
    unittest.main(verbosity=2)
