"""Actual producer → Python replacement → actual TS editability; no provider IO."""
from pathlib import Path
from types import SimpleNamespace
import json
import subprocess

import pytest

from auditlayer_worker.core import AuditRecord, extract_fragment
from auditlayer_worker.generation import HermesReportGenerator
from auditlayer_worker.refinement_sections import replace_refinement_section

ROOT = Path(__file__).resolve().parents[2]


def web_headings(document):
    module = (ROOT / 'web/src/lib/refinement.ts').as_uri()
    program = (
        f'import {{editableReportSections}} from {json.dumps(module)};'
        'let input="";for await(const chunk of process.stdin)input+=chunk;'
        'process.stdout.write(JSON.stringify(editableReportSections(JSON.parse(input))));'
    )
    result = subprocess.run(
        ['node', '--experimental-strip-types', '--input-type=module', '-e', program],
        input=json.dumps(document), capture_output=True, text=True,
        cwd=ROOT / 'web', timeout=15, check=True,
    )
    return json.loads(result.stdout)


@pytest.mark.parametrize('heading,body', [
    ('Key Gaps', '<table><tr><td>Observed 123</td></tr></table>'),
    ('Key Gaps', '<table><tbody><tr><td>Observed 123</td></tr></tbody></table>'),
    ('😀' * 100, '<p>Observed 123</p>'),
])
def test_real_refinement_producer_remains_editable_in_both_languages(heading, body):
    fragment = f'<section><h2>{heading}</h2>{body}</section>'

    class Client:
        def chat(self, **kwargs):
            assert kwargs['model'] == 'deepseek-v4-flash'
            assert kwargs['toolsets'] == ()
            return SimpleNamespace(
                content=fragment, model='deepseek-v4-flash',
                usage=SimpleNamespace(tokens_in=42, tokens_out=7, estimated=False),
            )

    generator = HermesReportGenerator(Client(), 'deepseek-v4-flash', (), 4000, .2)
    base = f'<section><h2>{heading}</h2><p>Observed 123</p></section>'
    result = generator.refine(
        AuditRecord.from_row({'id': 'fixture', 'handle': 'fixture'}),
        base, heading, 'Clarify facts', lambda *args: None,
    )
    updated = replace_refinement_section(base, heading, result.fragment)
    assert web_headings(updated) == [heading]
    assert replace_refinement_section(updated, heading, 'REPLACED') == 'REPLACED'


@pytest.mark.parametrize('body', [
    '<p><div>Observed 123</div></p>',
    '<p><span><table><tr><td>Observed 123</td></tr></table></span></p>',
    '<p><p>Observed 123</p></p>',
    '<p><a href="https://example.com"><a href="https://example.org">123</a></a></p>',
    '<ul><li>123<li>456</li></li></ul>',
    '<table><td>123</td></table>',
    '<table><tr><td>123</td><tr><td>456</td></tr></tr></table>',
])
def test_browser_repaired_structures_are_rejected_by_producer_and_consumer(body):
    fragment = f'<section><h2>Key Gaps</h2>{body}</section>'
    assert web_headings(fragment) == []
    with pytest.raises(ValueError, match='safe'):
        extract_fragment(fragment, expected_heading='Key Gaps')


@pytest.mark.parametrize('body', [
    '<table><div>123</div></table>', '<table>123</table>',
    '<table><tbody><td>123</td></tbody></table>',
    '<table><tr>123</tr></table>', '<tr><td>123</td></tr>',
    '<ul><div>123</div></ul>', '<ul>123</ul>', '<li>123</li>',
    '<h3><h4>123</h4></h3>',
])
def test_producer_requires_supported_structural_content_model(body):
    with pytest.raises(ValueError, match='safe'):
        extract_fragment(f'<section><h2>Key Gaps</h2>{body}</section>', expected_heading='Key Gaps')
