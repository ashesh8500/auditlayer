"""Offline contract checks; database concurrency/rollback require the SQL integration gate."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]

class AdminContract(unittest.TestCase):
    def test_gift_delta_is_locked_before_absolute_assignment(self):
        sql = next((ROOT / 'supabase/migrations').glob('*_admin_transactional_controls.sql')).read_text()
        self.assertIn('public.admin_assign_access_delta', sql)
        self.assertLess(sql.index('for update'), sql.index('public.admin_set_access('))
        self.assertIn('v_balance + p_gifted_delta', sql)
        self.assertIn('from public, anon, authenticated', sql)

    def test_manual_version_is_serialized_and_logged(self):
        sql = next((ROOT / 'supabase/migrations').glob('*_admin_transactional_controls.sql')).read_text()
        self.assertIn('public.admin_finalize_manual_report', sql)
        manual = sql.split('create function public.admin_finalize_manual_report')[1]
        self.assertLess(manual.index('for update'), manual.index('max(version)'))
        self.assertIn("status in ('queued', 'running')", manual)
        self.assertIn('insert into public.audit_report_versions', manual)
        self.assertIn('insert into public.audit_events', manual)
        self.assertIn('insert into public.admin_actions', manual)
        self.assertIn('storage.objects', manual)

if __name__ == '__main__': unittest.main()
