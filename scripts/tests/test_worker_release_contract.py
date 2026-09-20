from pathlib import Path
import subprocess
import unittest
ROOT = Path(__file__).resolve().parents[2]

class ReleaseScriptContract(unittest.TestCase):
    def test_release_requires_explicit_reviewed_revision(self):
        result = subprocess.run(['bash', str(ROOT/'worker/infra/deploy.sh')], capture_output=True, text=True, env={'PATH': '/usr/bin:/bin'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('REVIEWED_REVISION', result.stderr)
        self.assertNotIn('Pull latest', result.stdout)

    def test_release_backs_up_and_drains_before_sync(self):
        script = (ROOT/'worker/infra/deploy.sh').read_text()
        self.assertNotIn('git pull', script)
        self.assertNotIn('validate-hermes', script)
        self.assertIn('archive "$REVIEWED_REVISION"', script)
        self.assertIn('--frozen', script)
        self.assertLess(script.index('cp -a'), script.index('rsync -a'))
        self.assertLess(script.index('"$DRAIN_HOOK"'), script.index('rsync -a'))
        self.assertIn('is-active', script)
        self.assertIn('release-preflight', script)
        self.assertIn('diff -qr', script)

    def test_release_retains_fence_until_health_and_uses_reviewed_hook(self):
        script = (ROOT/'worker/infra/deploy.sh').read_text()
        self.assertIn('DRAIN_TOKEN', script)
        self.assertIn('cmp -- "$DRAIN_HOOK" "$STAGE/worker/infra/drain.sh"', script)
        self.assertLess(script.index('"$DRAIN_HOOK" verify'), script.index('rsync -a'))
        self.assertGreater(script.index('"$DRAIN_HOOK" resume'), script.index('for port in 8788 8789'))

    def test_bootstrap_and_make_share_current_contract(self):
        bootstrap = (ROOT/'infra/hermes-vm/bootstrap.sh').read_text()
        self.assertNotIn('HERMES_MODE=http', bootstrap)
        self.assertIn('--frozen --extra embedded --extra dev', bootstrap)
        make = (ROOT/'Makefile').read_text()
        self.assertIn('pnpm test', make)
        self.assertNotIn('auditlayer-worker.vm.service', make)
        self.assertIn('worker/infra/deploy.sh', make)

if __name__ == '__main__': unittest.main()
