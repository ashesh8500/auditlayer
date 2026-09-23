"""Build explicitly synthetic strategy artifacts through actual generation.

No provider network. Destination must be new. Prior live/v2 fixtures are immutable.
"""
import json
from pathlib import Path
from build_factual_repair_fixtures import write_offline_artifacts, Text
from test_product_strategy import public_case
from test_factual_report import public_evidence
from test_generation_runtime import _Client, _generator
from auditlayer_worker.openrouter import MODEL
from auditlayer_worker.generation import GenerationStageError
from auditlayer_worker.quality import evaluate_report_quality


def build(destination):
    write_offline_artifacts(destination)
    root = Path(destination)
    audit, evidence, form = public_case()
    client = _Client([json.dumps(form)])
    gen = _generator(client)
    gen.model = MODEL
    result = gen.generate(audit, lambda *a: None, research_cache=json.dumps(evidence))
    assert len(client.calls) == 1
    assert evaluate_report_quality(result.html, report_type='standard').passed
    folder = root / 'public'
    folder.mkdir()
    (folder / 'report.html').write_text(result.html)
    parser = Text()
    parser.feed(result.html)
    (folder / 'report-text.txt').write_text('\n'.join(parser.parts) + '\n')
    for name, value in [('form', form), ('input', {'synthetic': True, 'evidence': evidence}),
                        ('prompt', client.calls[0]['messages']), ('evidence', json.loads(result.research_cache))]:
        (folder / (name + '.json')).write_text(json.dumps(value, indent=2))
    client = _Client([])
    gen = _generator(client)
    gen.model = MODEL
    try:
        gen.generate(audit, lambda *a: None, research_cache=public_evidence())
    except GenerationStageError as exc:
        assert exc.error_code == 'insufficient_strategy_evidence' and not client.calls
        (root / 'sparse-public-negative-control.json').write_text(json.dumps(dict(
            synthetic=True, error_code=exc.error_code, analysis_calls=0, report_produced=False), indent=2))
    else:
        raise AssertionError('Sparse evidence delivered an extract-only substitute')


if __name__ == '__main__':
    import sys
    build(sys.argv[1])
    print(sys.argv[1])
