"""Synthetic fixtures, not provider/live/product qualification.
Run from worker: PYTHONPATH=tests .venv/bin/python tests/build_factual_repair_fixtures.py DEST
The destination must not exist; failed live87af636 artifacts are never touched.
"""
import json
from dataclasses import asdict
from html.parser import HTMLParser
from pathlib import Path
from test_factual_repair import connected_case, analysis_form
from test_generation_runtime import _Client, _generator, _audit
from auditlayer_worker.generation import GenerationStageError
from auditlayer_worker.openrouter import MODEL
from auditlayer_worker.quality import evaluate_report_quality


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.hidden = [], False
    def handle_starttag(self, tag, attrs):
        if tag in ('style', 'script'): self.hidden = True
    def handle_endtag(self, tag):
        if tag in ('style', 'script'): self.hidden = False
    def handle_data(self, value):
        if not self.hidden and value.strip(): self.parts.append(value.strip())


def write_offline_artifacts(destination):
    """Real generation/prompt/parser/renderer; only provider transport is synthetic."""
    root = Path(destination)
    root.mkdir(parents=True, exist_ok=False)
    reports = {}
    for kind in ('creator', 'business'):
        audit, metrics = connected_case(kind)
        form = analysis_form(kind)
        client = _Client([json.dumps(form)])
        gen = _generator(client)
        gen.model = MODEL
        result = gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
        assert len(client.calls) == 1
        quality = evaluate_report_quality(result.html, report_type='standard')
        assert quality.passed, quality.blockers
        artifact = root / kind
        artifact.mkdir()
        (artifact / 'report.html').write_text(result.html)
        text = Text()
        text.feed(result.html)
        (artifact / 'report-text.txt').write_text('\n'.join(text.parts) + '\n')
        (artifact / 'input.json').write_text(json.dumps({'synthetic': True, 'audit': asdict(audit),
            'metrics': asdict(metrics)}, indent=2))
        (artifact / 'form.json').write_text(json.dumps(form, indent=2))
        (artifact / 'prompt.json').write_text(json.dumps(client.calls[0]['messages'], indent=2))
        (artifact / 'evidence.json').write_text(result.research_cache)
        reports[kind] = result.html
    audit = _audit()
    audit.id = 'synthetic-sparse-website'
    audit.platform = 'website'
    audit.handle = 'auditlayermedia.com'
    evidence = {'web': [dict(url='https://auditlayermedia.com/', title='AuditLayerMedia',
        description='Competitive intelligence for creators and brands.', evidence_mode='openrouter_exa')]}
    client = _Client([])
    gen = _generator(client)
    gen.model = MODEL
    try:
        gen.generate(audit, lambda *a: None, research_cache=json.dumps(evidence))
    except GenerationStageError as error:
        assert error.error_code == 'unsupported_report_scope' and not client.calls
        control = {'synthetic': True, 'input': evidence, 'error_code': error.error_code,
            'analysis_calls': len(client.calls), 'report_produced': False,
            'reason': 'Website copy cannot qualify a social report.'}
    else:
        raise AssertionError('Sparse website must not render a social report')
    (root / 'website-negative-control.json').write_text(json.dumps(control, indent=2))
    (root / 'qualification.json').write_text(json.dumps({'synthetic': True, 'live_calls': 0,
        'qualification_scope': 'offline_connected_typed_contract', 'launch_qualified': False}, indent=2))
    return reports


if __name__ == '__main__':
    import sys
    write_offline_artifacts(sys.argv[1])
    print(sys.argv[1])
