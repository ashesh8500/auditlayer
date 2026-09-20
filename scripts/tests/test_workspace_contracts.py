"""Offline shared-wire acceptance tests (no app/SQL writes)."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import shutil
import unittest

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / 'scripts/generate_workspace_contracts.py'

class ContractsTest(unittest.TestCase):
    def test_shared_fixtures_in_both_runtimes(self):
        fixture_path = ROOT / 'contracts/workspace-v1/fixtures.json'
        self.assertTrue(fixture_path.exists(), 'shared valid/invalid fixtures required')
        fixtures = json.loads(fixture_path.read_text())
        spec = importlib.util.spec_from_file_location('workspace_contracts', ROOT / 'worker/auditlayer_worker/workspace_contracts/__init__.py')
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for fixture in fixtures:
            with self.subTest(fixture=fixture['name']):
                if fixture['valid']:
                    self.assertEqual(module.validate(fixture['contract'], fixture['value']), fixture['value'])
                else:
                    with self.assertRaises(ValueError):
                        module.validate(fixture['contract'], fixture['value'])
        for value in [float('nan'), float('inf'), -float('inf')]:
            with self.assertRaises(ValueError):
                module.validate('Money', {'currency': 'USD', 'microusd': value})
        subprocess.run(['node', 'contracts/workspace-v1/test-runtime.cjs'], check=True, cwd=ROOT)

    def test_generation_and_drift(self):
        self.assertTrue(GEN.exists(), 'workspace generator must exist')
        subprocess.run([sys.executable, str(GEN), '--check'], check=True, cwd=ROOT)
        with tempfile.TemporaryDirectory(prefix='workspace-contract-test-') as directory:
            isolated = Path(directory)
            (isolated / 'scripts').mkdir()
            shutil.copy(GEN, isolated / 'scripts' / GEN.name)
            shutil.copytree(ROOT / 'contracts/workspace-v1', isolated / 'contracts/workspace-v1')
            command = [sys.executable, str(isolated / 'scripts' / GEN.name)]
            subprocess.run(command, check=True)
            generated = isolated / 'web/src/lib/workspace-contracts/index.ts'
            original = generated.read_bytes()
            subprocess.run(command, check=True)
            self.assertEqual(original, generated.read_bytes())
            subprocess.run(command + ['--check'], check=True)
            generated.write_text('// deliberate stale projection')
            result = subprocess.run(command + ['--check'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('Contract drift:', result.stderr)
            self.assertEqual(generated.read_text(), '// deliberate stale projection')

    def test_policy_and_schema_invariants(self):
        from jsonschema import Draft202012Validator
        source = ROOT / 'contracts/workspace-v1'
        schema = json.loads((source / 'schema.json').read_text())
        Draft202012Validator.check_schema(schema)
        policy = json.loads((source / 'policy.p01.v1.json').read_text())
        expected = {'monthly_price_microusd':129000000, 'included_microusd':30000000,
                    'topup_microusd':10000000, 'purchased_cycle_cap_microusd':70000000,
                    'consumption_cycle_cap_microusd':100000000, 'run_reservation_cap_microusd':15000000,
                    'upstream_exposure_cycle_cap_microusd':60000000, 'retail_reference_multiplier':3}
        for key, value in expected.items():
            self.assertEqual(policy[key], value)
        self.assertEqual(policy['display']['included_credits'] * policy['display']['microusd_per_credit'], policy['included_microusd'])
        self.assertEqual(policy['display']['credits_per_usd'] * policy['display']['microusd_per_credit'], 1000000)
        self.assertEqual(policy['purchased_expiry'], {'proposed_calendar_months':12,'status':'legal_unresolved'})
        self.assertEqual(policy['renewal_boundary'], 'confirmed_stripe_subscription_period')
        self.assertEqual(policy['allocation_order'], ['included_earliest_expiry','purchased_earliest_expiry'])
        for flag in ['auto_reload','automatic_legacy_conversion','silent_model_fallback','enrollment_enabled']:
            self.assertIs(policy[flag], False)
        self.assertEqual(json.loads((source / 'rate-cards.json').read_text()), [])
        fixtures = json.loads((source / 'fixtures.json').read_text())
        for name in schema['$defs']:
            self.assertTrue(any(x['contract']==name and x['valid'] for x in fixtures), name)
            self.assertTrue(any(x['contract']==name and not x['valid'] for x in fixtures), name)

if __name__ == '__main__':
    unittest.main()
