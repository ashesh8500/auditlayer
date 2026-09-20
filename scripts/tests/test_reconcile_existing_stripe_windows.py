"""Exercise the actual CLI main; replace only its network transport."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('backfill', Path(__file__).parents[1] / 'reconcile-existing-stripe-windows.py')
assert SPEC is not None and SPEC.loader is not None
BACKFILL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BACKFILL)


class BackfillTests(unittest.TestCase):
    def run_script(self, bounds, apply=True, legacy=(100, 300), expected=(100, 400)):
        profile = dict(id='offline-owner', plan='starter', stripe_subscription_id='sub_offline', stripe_customer_id='cus_offline', subscription_status='active', current_period_start=None, current_period_end=BACKFILL.datetime.fromtimestamp(expected[1], BACKFILL.timezone.utc).isoformat())
        subscription = dict(id='sub_offline', customer='cus_offline', status='active', current_period_start=legacy[0], current_period_end=legacy[1], items={'data': [{**bounds, 'price': {'id': 'price_starter', 'recurring': {'interval': 'month', 'interval_count': 1}}}]})
        writes = []
        def transport(url, headers, payload=None):
            if url.startswith('https://api.stripe.com/'):
                return subscription
            if '/rpc/' in url:
                writes.append(payload)
                return True
            if 'id=eq.' in url:
                return [{**profile, 'current_period_start': BACKFILL.datetime.fromtimestamp(expected[0], BACKFILL.timezone.utc).isoformat()}]
            return [profile]
        output = io.StringIO()
        with patch.dict(os.environ, {'SUPABASE_URL':'https://offline.invalid', 'SUPABASE_SERVICE_ROLE_KEY':'fixture', 'STRIPE_SECRET_KEY':'fixture', 'STRIPE_PRICE_STARTER':'price_starter', 'STRIPE_PRICE_PRO':'price_pro'}), patch.object(BACKFILL, 'request', transport), patch.object(sys, 'argv', ['backfill'] + (['--apply'] if apply else [])), contextlib.redirect_stdout(output):
            code = BACKFILL.main()
        return code, writes, [json.loads(line) for line in output.getvalue().splitlines()]

    def test_partial_item_bounds_reject_without_writes(self):
        for bounds in ({'current_period_end':400}, {'current_period_start':100}):
            with self.subTest(bounds=bounds):
                code, writes, output = self.run_script(bounds, legacy=(100,400))
                self.assertEqual(code, 1)
                self.assertEqual(writes, [])
                self.assertEqual(output[-1]['requires_review'], 1)
                self.assertEqual(output[0]['outcome'], 'requires_normal_stripe_reconciliation')

    def test_complete_item_pair_wins_over_legacy(self):
        code, writes, output = self.run_script({'current_period_start':200,'current_period_end':400}, expected=(200,400))
        self.assertEqual(code, 0)
        self.assertEqual((writes[0]['p_start_epoch'],writes[0]['p_end_epoch']), (200,400))
        self.assertEqual(output[0]['outcome'],'applied_verified')

    def test_absent_item_pair_uses_complete_legacy_pair(self):
        code, writes, _ = self.run_script({}, legacy=(100,400))
        self.assertEqual(code, 0)
        self.assertEqual((writes[0]['p_start_epoch'],writes[0]['p_end_epoch']), (100,400))

    def test_read_only_never_writes(self):
        code, writes, output = self.run_script({}, apply=False, legacy=(100,400))
        self.assertEqual((code,writes), (0,[]))
        self.assertEqual(output[0]['outcome'],'verified_read_only')


if __name__ == '__main__':
    unittest.main()
