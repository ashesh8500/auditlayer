"""SEC-1 real PostgreSQL regression tests; disposable local DB only.

ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' \
  python supabase/tests/instagram_targeted_reconnect_test.py
Set ALM_SEC1_LEGACY=1 only to demonstrate the pre-fix nine-argument race.
No Meta calls or real credentials. Every owner is generated and cleaned up.
"""
import os
import select
import shlex
import subprocess
import time
import unittest
import uuid


@unittest.skipUnless(os.environ.get('ALM_TEST_PSQL'), 'requires explicit disposable PostgreSQL command')
class TargetedReconnectTest(unittest.TestCase):
    def run_sql(self, statement):
        return subprocess.run(shlex.split(os.environ['ALM_TEST_PSQL']) +
                              ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                              input=statement, text=True, capture_output=True, timeout=30)

    def sql(self, statement):
        result = self.run_sql(statement)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def persist(self, targeted=False, connection=None, identity=9007199254740993, owner=None):
        name = 'persist_instagram_connection'
        extra = ''
        if targeted and not os.environ.get('ALM_SEC1_LEGACY'):
            name = 'persist_targeted_instagram_connection'
            extra = f",'{connection or self.connection}'::uuid"
        return (f"select connection_id::text||','||account_id::text from public.{name}("
                f"'{owner or self.owner}'::uuid,{identity}::bigint,'sec1_fixture','fixture-only',"
                "now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram'"
                f"{extra});")

    def disconnect(self):
        return f"select public.disconnect_instagram_connection('{self.owner}','{self.connection}');"

    def setUp(self):
        self.owner = str(uuid.uuid4())
        self.sql(f"insert into auth.users(id,email) values('{self.owner}','sec1@example.invalid');"
                 f"insert into public.profiles(id) values('{self.owner}') on conflict do nothing;")
        self.addCleanup(self.sql, f"delete from auth.users where id='{self.owner}';")
        self.connection, self.account = self.sql('set role service_role;' + self.persist()).split(',')

    def assert_disconnected(self):
        self.assertEqual(self.sql(f"select count(*) from public.instagram_connections where user_id='{self.owner}';"), '0')
        self.assertEqual(self.sql(f"select (ig_connection_id is null)::text||','||instagram_user_id::text "
                                  f"from public.accounts where id='{self.account}';"), 'true,9007199254740993')

    def test_disconnect_between_preflight_and_write_rejects(self):
        self.assertEqual(self.sql(f"select count(*) from public.instagram_connections where id='{self.connection}' "
                                  f"and user_id='{self.owner}' and ig_user_id=9007199254740993;"), '1')
        self.sql('set role service_role;' + self.disconnect())
        result = self.run_sql('set role service_role;' + self.persist(targeted=True))
        self.assertNotEqual(result.returncode, 0, 'stale callback restored credentials after disconnect')
        self.assertIn('instagram_connection_unavailable', result.stderr)
        self.assert_disconnected()
    def session(self, name, statement):
        process = subprocess.Popen(shlex.split(os.environ['ALM_TEST_PSQL']) +
                                   ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        def cleanup():
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=10)
        self.addCleanup(cleanup)
        assert process.stdin is not None
        process.stdin.write((f"set application_name='{name}'; set statement_timeout='15s'; "
                             "begin; set local role service_role;" + statement + '\n').encode())
        process.stdin.flush()
        return process

    def ready(self, process):
        # Explicit output barrier, not a sleep-based guess about transaction state.
        process.stdin.write(b'\\echo SEC1_READY\n')
        process.stdin.flush()
        output = b''
        deadline = time.monotonic() + 10
        while b'SEC1_READY' not in output and time.monotonic() < deadline:
            if select.select([process.stdout], [], [], 0.2)[0]:
                chunk = os.read(process.stdout.fileno(), 4096)
                if not chunk:
                    self.fail('transaction exited before ready: ' + process.stderr.read().decode())
                output += chunk
        self.assertIn(b'SEC1_READY', output)

    def wait_for_lock(self, name):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if self.sql(f"select count(*) from pg_stat_activity where application_name='{name}' "
                        "and wait_event_type='Lock';") == '1':
                return
            time.sleep(0.02)
        self.fail('second transaction never waited on the first')

    def interleave(self, first_sql, second_sql):
        tag = 'sec1_' + uuid.uuid4().hex
        first = self.session(tag + '_first', first_sql)
        self.ready(first)
        second = self.session(tag + '_second', second_sql)
        self.wait_for_lock(tag + '_second')
        first_out, first_err = first.communicate(b'commit;\n', timeout=20)
        self.assertEqual(first.returncode, 0, first_err.decode())
        second_out, second_err = second.communicate(b'commit;\n', timeout=20)
        return second.returncode, second_out.decode(), second_err.decode()

    def test_disconnect_commits_first_blocked_targeted_write_rejects(self):
        self.assertEqual(self.sql(f"select count(*) from public.instagram_connections where id='{self.connection}';"), '1')
        code, _, error = self.interleave(self.disconnect(), self.persist(targeted=True))
        self.assertNotEqual(code, 0)
        self.assertIn('instagram_connection_unavailable', error)
        self.assert_disconnected()

    def test_targeted_write_commits_first_disconnect_waits_then_deletes(self):
        code, _, error = self.interleave(self.persist(targeted=True), self.disconnect())
        self.assertEqual(code, 0, error)
        self.assert_disconnected()

    def test_replaced_target_rejects_without_mutating_new_explicit_add(self):
        self.sql('set role service_role;' + self.disconnect())
        new_connection, account = self.sql('set role service_role;' + self.persist()).split(',')
        self.assertNotEqual(new_connection, self.connection)
        self.assertEqual(account, self.account)
        before = self.sql(f"select row_to_json(c) from public.instagram_connections c where id='{new_connection}';")
        result = self.run_sql('set role service_role;' + self.persist(targeted=True))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('instagram_connection_unavailable', result.stderr)
        self.assertEqual(self.sql(f"select row_to_json(c) from public.instagram_connections c where id='{new_connection}';"), before)
        self.assertEqual(self.sql(f"select count(*) from public.subjects where user_id='{self.owner}';"), '1')
        self.assertEqual(self.sql(f"select count(*) from public.subject_channels where account_id='{self.account}';"), '1')

    def test_target_identity_and_owner_are_checked_inside_rpc(self):
        other = str(uuid.uuid4())
        self.sql(f"insert into auth.users(id,email) values('{other}','sec1-other@example.invalid');"
                 f"insert into public.profiles(id) values('{other}') on conflict do nothing;")
        self.addCleanup(self.sql, f"delete from auth.users where id='{other}';")
        before = self.sql(f"select row_to_json(c) from public.instagram_connections c where id='{self.connection}';")
        for statement in (self.persist(targeted=True, identity=9007199254740994),
                          self.persist(targeted=True, owner=other),
                          self.persist(targeted=True, connection=str(uuid.uuid4()))):
            with self.subTest(statement=statement):
                result = self.run_sql('set role service_role;' + statement)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('instagram_connection_unavailable', result.stderr)
        self.assertEqual(self.sql(f"select row_to_json(c) from public.instagram_connections c where id='{self.connection}';"), before)

    def test_success_preserves_identity_and_rotates_worker_fence(self):
        before = self.sql(f"select credential_version from public.instagram_connections where id='{self.connection}';")
        self.sql(f"update public.instagram_connections set is_active=false,connection_status='reconnect_required' where id='{self.connection}';")
        result = self.sql('set role service_role;' + self.persist(targeted=True))
        self.assertEqual(result, self.connection + ',' + self.account)
        after = self.sql(f"select credential_version from public.instagram_connections where id='{self.connection}';")
        self.assertNotEqual(before, after, 'same-token OAuth must still fence old worker writes')
        self.assertEqual(self.sql(f"select is_active::text||','||connection_status from public.instagram_connections where id='{self.connection}';"), 'true,connected')
        self.assertEqual(self.sql(f"set role service_role; select public.write_instagram_worker_state('{self.owner}','{self.connection}',"
                                  f"'{before}','reconnect','{{}}'::jsonb) is null;"), 't')

    def test_unprivileged_roles_cannot_call_targeted_writer(self):
        for role in ('anon', 'authenticated'):
            with self.subTest(role=role):
                result = self.run_sql(f'set role {role};' + self.persist(targeted=True))
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('permission denied for function persist_targeted_instagram_connection', result.stderr)
        self.assertEqual(self.sql("select has_function_privilege('service_role',"
                                  "'public.persist_targeted_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint,text,uuid)',"
                                  "'EXECUTE');"), 't')

    def test_eight_argument_compatibility_stays_inactive(self):
        legacy = self.persist().replace(",1::bigint,1::bigint,'instagram');", ",1::bigint,1::bigint);")
        self.assertEqual(self.sql('set role service_role;' + legacy), self.connection + ',' + self.account)
        self.assertEqual(self.sql(f"select (graph_api_family is null)::text||','||is_active::text||','||connection_status "
                                  f"from public.instagram_connections where id='{self.connection}';"), 'true,false,reconnect_required')


if __name__ == '__main__':
    unittest.main(verbosity=2)
