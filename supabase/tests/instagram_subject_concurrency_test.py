"""Real multi-session PostgreSQL test, never a mocked database.

Explicit opt-in to a disposable local DB:
ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' \
  python supabase/tests/instagram_subject_concurrency_test.py

The schema/migration must already be applied. Only generated fixture owners are
written/deleted. Do not point this at production.
"""
import concurrent.futures
import os
import shlex
import subprocess
import threading
import unittest
import uuid


@unittest.skipUnless(os.environ.get('ALM_TEST_PSQL'), 'requires explicit disposable PostgreSQL command')
class InstagramConcurrencyTest(unittest.TestCase):
    def sql(self, statement):
        result = subprocess.run(
            shlex.split(os.environ['ALM_TEST_PSQL']) + ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
            input=statement, text=True, capture_output=True, timeout=45,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def setUp(self):
        self.owner = str(uuid.uuid4())
        self.sql(f"insert into auth.users(id,email) values('{self.owner}','concurrency@example.invalid');"
                 f"insert into public.profiles(id) values('{self.owner}') on conflict do nothing;")

    def tearDown(self):
        self.sql(f"delete from auth.users where id='{self.owner}';")

    def persist(self):
        return ("select connection_id::text || ',' || account_id::text from "
                f"public.persist_instagram_connection('{self.owner}',999001::bigint,"
                "'parallel_identity','fixture-only',now()+interval '60 days','BUSINESS',"
                "1::bigint,1::bigint,'instagram');")

    def test_parallel_callbacks_share_durable_identity(self):
        barrier = threading.Barrier(8)

        def callback(_):
            barrier.wait(timeout=20)
            return self.sql('begin; set local role service_role;' + self.persist()
                            + 'select pg_sleep(0.1); commit;')

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(callback, range(8)))
        self.assertEqual(len(set(results)), 1, 'callbacks diverged')
        connection, account = results[0].split(',')
        count = self.sql(f"select count(*) from public.subject_channels sc join public.subjects s on s.id=sc.subject_id "
                         f"where s.user_id='{self.owner}' and sc.account_id='{account}';")
        self.assertEqual(count, '1')
        self.assertEqual(self.sql(f"select count(*) from public.subjects where user_id='{self.owner}';"), '1')
        self.sql(f"begin; set local role service_role; select public.disconnect_instagram_connection('{self.owner}','{connection}'); commit;")
        reconnected = self.sql('begin; set local role service_role;' + self.persist() + 'commit;')
        self.assertEqual(reconnected.split(',')[1], account)
        self.assertEqual(self.sql(f"select count(*) from public.subjects where user_id='{self.owner}';"), '1')

    def test_unprivileged_roles_cannot_call_writer(self):
        for role in ['anon', 'authenticated']:
            result = subprocess.run(
                shlex.split(os.environ['ALM_TEST_PSQL']) + ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                input=f'begin; set local role {role};' + self.persist() + 'rollback;',
                text=True, capture_output=True, timeout=20,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('permission denied for function persist_instagram_connection', result.stderr)
        self.assertEqual(self.sql(f"select count(*) from public.instagram_connections where user_id='{self.owner}';"), '0')


if __name__ == '__main__':
    unittest.main(verbosity=2)
