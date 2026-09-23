"""Offline strategy-v4 fixtures. New destination only; never rewrite v3/live receipts."""
import hashlib
import json
from pathlib import Path
from build_product_strategy_fixtures import build
from test_strategy_task_contract import ADVERSE
from test_factual_repair import connected_case
from product_strategy_fixtures import strategy_form
from test_generation_runtime import _Client, _generator
from auditlayer_worker import factual
from auditlayer_worker.core import PROMPT_VERSION
from auditlayer_worker.generation import GenerationStageError
from auditlayer_worker.openrouter import MODEL


def build_v4(destination):
    build(destination)
    root = Path(destination)
    controls = []
    for typed in (False, True):
        for instruction in ADVERSE:
            audit, metrics = connected_case()
            form = strategy_form()
            form['strategy']['decisions'][0]['tasks'][0] = (
                dict(kind='creative_proposal', instruction=instruction) if typed else instruction)
            client = _Client([json.dumps(form), json.dumps(form)])
            gen = _generator(client)
            gen.model = MODEL
            try:
                gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
            except GenerationStageError as exc:
                assert exc.error_code == 'structured_output_invalid' and not exc.retryable
                assert len(client.calls) == 2
                controls.append(dict(instruction=instruction, typed=typed, accepted=False,
                    report_produced=False, analysis_calls=len(client.calls), error_code=exc.error_code))
            else:
                raise AssertionError('Unsupported instruction delivered')
    (root / 'task-negative-controls.json').write_text(json.dumps(controls, indent=2) + '\n')
    for kind in ('creator', 'business', 'public'):
        folder = root / kind
        form = json.loads((folder / 'form.json').read_text())
        evidence = json.loads((folder / 'evidence.json').read_text())
        assert evidence['analysis']['form'] == form
        assert evidence['analysis']['version'] == factual.VERSION
        assert 'data-factual-contract="strategy-v4"' in (folder / 'report.html').read_text()
        assert all(t['kind'] == 'creative_proposal' for d in form['strategy']['decisions'] for t in d['tasks'])
    worker = Path(__file__).resolve().parents[1]
    source_paths = [worker / 'auditlayer_worker' / name for name in
        ('strategic_analysis.py', 'connected_analysis.py', 'factual.py', 'core.py')]
    source_paths += [Path(__file__).resolve(), worker / 'tests/product_strategy_fixtures.py']
    manifest = dict(synthetic=True, live_calls=0, prompt_version=PROMPT_VERSION,
        factual_contract=factual.VERSION, launch_qualified=False,
        provenance='Authored synthetic forms through actual offline generator; source bytes pinned below, not a provider qualification.',
        source_sha256={str(p.relative_to(worker)): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths},
        artifact_sha256={str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                         for p in sorted(root.rglob('*')) if p.is_file()})
    (root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(dict(destination=str(root), reports=3, rejected_controls=len(controls), live_calls=0)))


if __name__ == '__main__':
    import sys
    build_v4(sys.argv[1])
