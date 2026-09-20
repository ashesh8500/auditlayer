"""Disposable Postgres/RLS probes: no live env, ports, or other lane containers.
Run: python3 supabase/tests/share_security_integration_test.py
Creates its own postgres:16 container without host ports and destroys only that UUID name.
Uses exact historical 0006 + remediation against minimal supporting auth/audit schema.
"""
import concurrent.futures
from pathlib import Path
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
OWNER = '00000000-0000-0000-0000-000000000001'
OTHER = '00000000-0000-0000-0000-000000000002'
AUDIT = '00000000-0000-0000-0000-000000000003'
FOREIGN = '00000000-0000-0000-0000-000000000004'


class ShareSecurity(unittest.TestCase):
    container = 'alm-share-security-' + uuid.uuid4().hex[:12]

    @classmethod
    def sql(cls, text, check=True):
        result = subprocess.run(['docker', 'exec', '-i', cls.container, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], input=text, text=True, capture_output=True)
        if check and result.returncode:
            raise AssertionError(result.stderr)
        return result

    @classmethod
    def setUpClass(cls):
        subprocess.run(['docker', 'run', '--detach', '--name', cls.container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16'], check=True, capture_output=True)
        cls.addClassCleanup(lambda: subprocess.run(['docker', 'rm', '-f', cls.container], check=True, capture_output=True))
        for _ in range(60):
            if subprocess.run(['docker', 'exec', cls.container, 'pg_isready', '-U', 'postgres'], capture_output=True).returncode == 0:
                break
            time.sleep(.25)
        cls.sql(f"""
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create table public.profiles(id uuid primary key,role text);
create table public.audits(id uuid primary key,user_id uuid references profiles(id),status text,report_path text);
create function public.is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
grant select on public.audits to authenticated,service_role;
insert into profiles values('{OWNER}','client'),('{OTHER}','client');
insert into audits values('{AUDIT}','{OWNER}','ready','report.html'),('{FOREIGN}','{OTHER}','ready','other.html');
""")
        cls.sql((ROOT / 'supabase/migrations/0006_share_links.sql').read_text())
        # Match Supabase's historical default exposed-table grants before migration.
        cls.sql('grant all on public.share_links to anon,authenticated,service_role;')
        # Reproduce the reported pre-migration holes in this disposable DB first.
        cls.sql(f"set role authenticated; set request.jwt.claim.sub='{OWNER}'; insert into share_links(audit_id,token,mode,created_by) values('{FOREIGN}','forged_baseline','public','{OWNER}');")
        assert cls.sql("set role anon; select token from share_links").stdout.strip() == 'forged_baseline'
        assert cls.sql(f"set role authenticated; set request.jwt.claim.sub='{OWNER}'; update share_links set revoked_at=now() returning id").stdout.strip() == ''
        cls.sql((ROOT / 'supabase/migrations/20260919204112_share_security.sql').read_text())
        assert cls.sql("select revoked_at is not null from share_links where token='forged_baseline'").stdout.strip() == 't'

    def setUp(self):
        self.sql('truncate public.share_links cascade;')
        self.sql(f"insert into share_links(audit_id,token,mode,email,created_by) values('{AUDIT}','test_token','email','recipient@example.test','{OWNER}');")

    def as_owner(self, sql):
        return f"set role authenticated; set request.jwt.claim.sub='{OWNER}'; {sql}"

    def call(self, action, hash='a'*64, session='b'*64, email='recipient@example.test', token='test_token'):
        return self.sql(f"set role service_role; select share_email_challenge('{action}','{token}','{email}','{hash}','{session}');").stdout.strip()

    def valid(self, token='test_token', session='b'*64):
        return self.sql(f"set role service_role; select share_session_valid('{token}','{session}');").stdout.strip() == 't'

    def activate(self):
        self.assertEqual(self.call('reserve'), 'reserved')
        self.assertEqual(self.call('activate'), 'sent')

    def test_anonymous_enumeration_and_rpc_denied(self):
        for sql in ['select token from share_links', "select is_share_link_valid('test_token')", "select increment_share_view('test_token')", "select share_session_valid('test_token','x')", "select share_email_challenge('reserve','test_token','x','x',null)", 'select * from share_sessions']:
            result = self.sql('set role anon; '+sql, check=False)
            self.assertNotEqual(result.returncode, 0, sql)
            self.assertIn('permission denied', result.stderr)

    def test_foreign_insert_denied_and_owner_insert_allowed(self):
        foreign = self.sql(self.as_owner(f"insert into share_links(audit_id,token,mode,created_by) values('{FOREIGN}','forged','public','{OWNER}')"), check=False)
        self.assertIn('row-level security', foreign.stderr)
        self.assertEqual(self.sql("select count(*) from share_links where token='forged'").stdout.strip(), '0')
        self.sql(self.as_owner(f"insert into share_links(audit_id,token,mode,created_by) values('{AUDIT}','legitimate','public','{OWNER}')"))

    def test_owner_safe_projection_and_private_columns_denied(self):
        self.assertEqual(self.sql(self.as_owner('select token from share_links')).stdout.strip(), 'test_token')
        for column in ['verification_code','verification_attempts','verification_code_expires']:
            self.assertNotEqual(self.sql(self.as_owner('select '+column+' from share_links'), check=False).returncode, 0)
        self.assertEqual(self.sql(f"set role authenticated; set request.jwt.claim.sub='{OTHER}'; select count(token) from share_links").stdout.strip(), '0')

    def test_revoke_readback_and_no_unrevoke(self):
        self.activate(); self.assertEqual(self.call('verify'), 'verified'); self.assertTrue(self.valid())
        self.assertEqual(self.sql(self.as_owner("update share_links set revoked_at=now() where token='test_token' returning token")).stdout.strip(), 'test_token')
        self.assertEqual(self.sql(self.as_owner("select revoked_at is not null from share_links where token='test_token'")).stdout.strip(), 't')
        self.assertFalse(self.valid())
        self.assertEqual(self.call('reserve'), 'unavailable')
        self.assertNotEqual(self.sql(self.as_owner('update share_links set revoked_at=null'), check=False).returncode, 0)

    def test_foreign_revoke_zero_rows_leaves_link_active(self):
        result = self.sql(f"set role authenticated; set request.jwt.claim.sub='{OTHER}'; update share_links set revoked_at=now() returning id")
        self.assertEqual(result.stdout.strip(), '')
        self.assertEqual(self.sql('select revoked_at is null from share_links').stdout.strip(), 't')

    def test_session_requires_delivery_consumed_code_and_exact_recipient(self):
        self.assertEqual(self.call('reserve'), 'reserved')
        self.assertEqual(self.call('verify'), 'invalid')  # delivery not activated
        self.assertEqual(self.call('activate'), 'sent')
        self.assertEqual(self.call('verify', email='stranger@example.test'), 'invalid')
        self.assertEqual(self.call('verify'), 'verified')
        self.assertEqual(self.call('verify'), 'invalid')  # no replay
        self.assertTrue(self.valid())
        self.assertFalse(self.valid(token='different_token'))
        self.assertFalse(self.valid(session='c'*64))
        self.sql("update share_links set email='changed@example.test'")
        self.assertFalse(self.valid())

    def test_attempt_and_send_bounds(self):
        self.activate()
        for _ in range(5): self.assertEqual(self.call('verify', hash='c'*64), 'invalid')
        self.assertEqual(self.call('verify'), 'limited')
        self.assertEqual(self.call('reserve'), 'limited')
        for _ in range(4):
            self.sql("update share_links set verification_sent_at=now()-interval '61 seconds'")
            self.assertEqual(self.call('reserve'), 'reserved')
        self.sql("update share_links set verification_sent_at=now()-interval '61 seconds'")
        self.assertEqual(self.call('reserve'), 'limited')
        self.sql("update share_links set verification_window_at=now()-interval '61 minutes'")
        self.assertEqual(self.call('reserve'), 'reserved')

    def test_expiry_and_readiness(self):
        self.activate(); self.assertEqual(self.call('verify'), 'verified')
        self.sql("update share_sessions set expires_at=now()-interval '1 second'")
        self.assertFalse(self.valid())
        self.sql("update share_links set expires_at=now()-interval '1 second'")
        self.assertEqual(self.call('reserve'), 'unavailable')
        self.sql("update share_links set expires_at=null; update audits set status='running'")
        self.assertEqual(self.call('reserve'), 'unavailable')
        self.sql("update audits set status='ready'")

    def test_owner_cannot_modify_gate_or_forge_verification(self):
        for assignment in ["mode='public'", "verified_at=now()", "verification_code='forged'", "email='other@example.test'"]:
            self.assertNotEqual(self.sql(self.as_owner('update share_links set '+assignment), check=False).returncode, 0)
        self.assertEqual(self.sql("select mode||':'||email from share_links").stdout.strip(), 'email:recipient@example.test')
        self.assertNotEqual(self.sql(self.as_owner("select share_email_challenge('verify','test_token','recipient@example.test','a',null)"), check=False).returncode, 0)
        self.assertNotEqual(self.sql(self.as_owner('select * from share_sessions'), check=False).returncode, 0)

    def test_code_expiry_and_session_readiness_are_independent_gates(self):
        self.activate()
        self.sql("update share_links set verification_code_expires=now()-interval '1 second'")
        self.assertEqual(self.call('verify'), 'invalid')
        self.sql("update share_links set verification_sent_at=now()-interval '61 seconds'")
        self.activate(); self.assertEqual(self.call('verify'), 'verified'); self.assertTrue(self.valid())
        self.sql("update share_links set expires_at=now()-interval '1 second'")
        self.assertFalse(self.valid())
        self.sql("update share_links set expires_at=null; update audits set report_path=null")
        self.assertFalse(self.valid())
        self.sql("update audits set report_path='report.html'")
        self.assertTrue(self.valid())

    def test_concurrent_sends_and_code_consumption(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(lambda _: self.call('reserve'), range(2))), ['limited','reserved'])
        self.assertEqual(self.call('activate'), 'sent')
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            outcomes = list(pool.map(lambda n: self.call('verify', session=str(n)*64), [1,2]))
        self.assertEqual(sorted(outcomes), ['invalid','verified'])
        self.assertEqual(self.sql('select count(*) from share_sessions').stdout.strip(), '1')


if __name__ == '__main__':
    unittest.main(verbosity=2)
