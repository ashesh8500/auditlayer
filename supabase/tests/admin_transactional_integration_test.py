"""Execute real admin RPC SQL on an isolated Docker Postgres fixture, never production.
Run: ALM_ADMIN_TEST_CONTAINER=alm-admin-ops-test-20260919 python3 .../admin_transactional_integration_test.py
Uses actual base tables + version/admin migrations and documented prerequisite columns.
This is not a full Supabase migration-chain/JWT test.
"""
import os
from pathlib import Path
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = os.environ.get('ALM_ADMIN_TEST_CONTAINER', '')
ACTOR = '00000000-0000-0000-0000-000000000001'
USER = '00000000-0000-0000-0000-000000000002'
AUDIT = '00000000-0000-0000-0000-000000000003'

@unittest.skipUnless(CONTAINER.startswith('alm-admin-ops-test-'), 'explicit isolated admin container required')
class AdminSQL(unittest.TestCase):
    @classmethod
    def sql(cls, text, check=True):
        return subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', cls.db, '-v', 'ON_ERROR_STOP=1', '-At'], input=text, text=True, capture_output=True, check=check)

    @classmethod
    def setUpClass(cls):
        cls.db = 'admin_' + uuid.uuid4().hex
        subprocess.run(['docker','exec', CONTAINER,'createdb','-U','postgres',cls.db],check=True)
        cls.sql("""create schema auth; create schema extensions; create schema storage;
        create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
        create table storage.objects(bucket_id text, name text);
        do $$ begin create role anon; create role authenticated; create role service_role; exception when duplicate_object then null; end $$;
        create function public.is_admin() returns boolean language sql as 'select false';
        create function public.owns_audit(uuid) returns boolean language sql as 'select false';""")
        migrations = ROOT/'supabase/migrations'
        cls.sql((migrations/'0001_init.sql').read_text())
        cls.sql("""alter table profiles add gifted_audits integer not null default 0;
        alter table profiles add account_type text not null default 'standard';
        alter table audits add prompt_version text;
        alter table audits add agent_bundle_version text;
        """)
        cls.sql((migrations/'0013_admin_actions.sql').read_text())
        cls.sql((migrations/'20260720172000_audit_report_versions.sql').read_text())
        cls.sql('alter table audit_report_versions add agent_bundle_version text;')
        historical = (migrations/'0022_commercial_entitlements.sql').read_text()
        cls.sql(historical[historical.index('create or replace function public.admin_set_access('):historical.index('-- Audit insertion')])
        cls.sql(next(migrations.glob('*_admin_transactional_controls.sql')).read_text())
        cls.sql(f"insert into auth.users(id) values ('{ACTOR}'),('{USER}'); update profiles set role='admin' where id='{ACTOR}'; insert into audits(id,user_id,handle,status) values ('{AUDIT}','{USER}','fixture','failed');")

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['docker','exec',CONTAINER,'dropdb','-U','postgres',cls.db],check=True)

    def setUp(self):
        self.sql(f"drop trigger if exists reject_admin_log on admin_actions; delete from audit_events; delete from audit_report_versions; delete from admin_actions; delete from refinements; update profiles set gifted_audits=3,plan='free',subscription_status='trial',account_type='standard' where id='{USER}'; update audits set status='failed',report_path=null,report_version=1 where id='{AUDIT}';")

    def assign(self, delta=1, plan='enterprise', kind='standard', check=True):
        return self.sql(f"select public.admin_assign_access_delta('{ACTOR}','{USER}','{plan}','{kind}',{delta},'fixture assignment');", check)

    def test_manual_precedence_and_atomic_delta(self):
        self.assign()
        self.assertEqual(self.sql(f"select gifted_audits||':'||subscription_status from profiles where id='{USER}'").stdout.strip(),'4:manual_enterprise')
        self.assign(-1, 'pro', 'comp')
        self.assertEqual(self.sql(f"select gifted_audits||':'||subscription_status from profiles where id='{USER}'").stdout.strip(),'3:complimentary')
        self.assertNotEqual(self.assign(-100, check=False).returncode,0)
        self.assertEqual(self.sql('select count(*) from admin_actions').stdout.strip(),'2')

    def reject_log(self):
        self.sql("create or replace function public.reject_log() returns trigger language plpgsql as $$ begin raise exception 'forced_log_failure'; end $$; create trigger reject_admin_log before insert on admin_actions for each row execute function public.reject_log();")

    def test_log_failure_rolls_back_access(self):
        self.reject_log()
        self.assertNotEqual(self.assign(check=False).returncode,0)
        self.assertEqual(self.sql(f"select gifted_audits||':'||plan from profiles where id='{USER}'").stdout.strip(),'3:free')

    def test_concurrent_consumption_is_not_overwritten(self):
        # The same profile lock/update primitive used by entitled submissions.
        command = ['docker','exec','-i',CONTAINER,'psql','-X','-U','postgres','-d',self.db,'-v','ON_ERROR_STOP=1','-At']
        consumer = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        assert consumer.stdin is not None
        consumer.stdin.write(f"begin; update profiles set gifted_audits=gifted_audits-1 where id='{USER}'; select pg_sleep(0.5); commit;")
        consumer.stdin.close()
        self.assign(2)
        consumer.wait(timeout=5)
        assert consumer.stdout is not None and consumer.stderr is not None
        consumer.stdout.close(); consumer.stderr.close()
        self.assertEqual(consumer.returncode,0)
        self.assertEqual(self.sql(f"select gifted_audits from profiles where id='{USER}'").stdout.strip(),'4')

    def manual(self, n=1, check=True):
        path=f'{AUDIT}/manual/00000000-0000-0000-0000-{n:012d}.html'
        self.sql(f"insert into storage.objects values ('reports','{path}');")
        return self.sql(f"select admin_finalize_manual_report('{ACTOR}','{AUDIT}','{path}');",check)

    def test_manual_versions_and_replay_do_not_rewind(self):
        self.manual(1); self.manual(2); self.manual(1)
        self.assertEqual(self.sql('select count(*) from audit_report_versions').stdout.strip(),'2')
        self.assertEqual(self.sql(f"select report_version from audits where id='{AUDIT}'").stdout.strip(),'2')
        self.assertEqual(self.sql('select count(*) from admin_actions').stdout.strip(),'2')

    def test_manual_log_failure_rolls_back_pointer_version_event(self):
        self.reject_log()
        self.assertNotEqual(self.manual(check=False).returncode,0)
        self.assertEqual(self.sql('select count(*) from audit_report_versions').stdout.strip(),'0')
        self.assertEqual(self.sql('select count(*) from audit_events').stdout.strip(),'0')
        self.assertEqual(self.sql(f"select status from audits where id='{AUDIT}'").stdout.strip(),'failed')

    def test_active_work_and_browser_call_are_rejected(self):
        self.sql(f"update audits set status='running' where id='{AUDIT}'")
        self.assertNotEqual(self.manual(check=False).returncode,0)
        result=self.sql(f"set role anon; select admin_assign_access_delta('{ACTOR}','{USER}','pro','comp',1,'fixture');",False)
        self.assertIn('permission denied',result.stderr)

if __name__=='__main__': unittest.main()
