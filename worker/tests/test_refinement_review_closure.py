"""Offline review regressions: use the real renderer, never provider calls."""
import json
import pytest
from auditlayer_worker import core
from auditlayer_worker.generation import _append_evidence_sources


@pytest.mark.parametrize('report_type', ['pulse', 'standard', 'extended', 'blueprint', 'enterprise'])
@pytest.mark.parametrize('selected', [0, -1])
def test_refinement_prompt_contains_selected_rendered_content_and_sources(report_type, selected):
    audit = core.AuditRecord.from_row({'id': 'evidence', 'handle': 'fixture', 'report_type': report_type})
    headings = core._load_template_sections(report_type)
    sections = [{'heading': h, 'lede': f'EVIDENCE_{i}_observed_123', 'items': [{'title': 'Evidence', 'body': 'Observed sample', 'value': 'N/A'}]}
                for i, h in enumerate(headings)]
    document = core.assemble_structured_report_html(audit, json.dumps({'sections': sections}))
    document = _append_evidence_sources(document, [('SOURCE_MARKER', 'https://example.test/proof', 'public_research')], connected_metrics=False)
    prompt = core.build_refinement_prompt(audit, document, headings[selected], 'Clarify while preserving evidence')
    if headings[selected] == 'Get the Execution Plan':
        assert 'Review current pricing' in prompt
        assert sections[selected]['lede'] not in prompt
    else:
        assert sections[selected]['lede'] in prompt
    assert 'SOURCE_MARKER' in prompt
    assert 'https://example.test/proof' in prompt
    assert '<style' not in prompt and '@media' not in prompt
    assert 'untrusted' in prompt.lower()


@pytest.mark.parametrize('heading_html', ['<h2 class="section-title">Key Gaps</h2>', '<h2><span class="title">Key Gaps</span></h2>'])
def test_safe_heading_output_remains_editable(heading_html):
    from auditlayer_worker.refinement_sections import replace_refinement_section
    fragment = core.extract_fragment('<section>' + heading_html + '<p>Evidence</p></section>', expected_heading='Key Gaps')
    assert replace_refinement_section(fragment, 'Key Gaps', 'REPLACED') == 'REPLACED'
    assert 'Evidence' in core.build_refinement_prompt(core.AuditRecord.from_row({'id': 'a', 'handle': 'x'}), fragment, 'Key Gaps', 'Clarify')


def test_refinement_rejects_block_markup_inside_heading():
    with pytest.raises(ValueError, match='safe'):
        core.extract_fragment('<section><h2><div>Key Gaps</div></h2><p>Evidence</p></section>', expected_heading='Key Gaps')


@pytest.mark.parametrize('document', [
    '<section><h2><div>Key Gaps</div></h2></section>',
    '<section><h2>Key Gaps</h2><section><h2>Other</h2></section></section>',
    '<section><h2 onclick="bad()">Key Gaps</h2></section>',
    '<section><h2>Key Gaps</h2><h2>Key Gaps</h2></section>',
    '<section><h2>Key Gaps</h2></section>' * 2,
    '<section><h2 class="a" class="b">Key Gaps</h2></section>',
])
def test_ambiguous_or_active_section_is_not_editable(document):
    from auditlayer_worker.refinement_sections import replace_refinement_section
    with pytest.raises(ValueError, match='section'):
        replace_refinement_section(document, 'Key Gaps', 'REPLACED')


def test_snapshot_date_and_limitations_outside_sections_reach_prompt():
    audit = core.AuditRecord.from_row({'id': 'a', 'handle': 'fixture'})
    document = '<html><head><style>CSS_NOT_EVIDENCE</style></head><body><p>As of 2026-09-18; public snapshot only</p><section><h2>Evidence</h2><p>Observed 123</p></section></body></html>'
    prompt = core.build_refinement_prompt(audit, document, 'Evidence', 'Clarify')
    assert 'As of 2026-09-18; public snapshot only' in prompt
    assert 'CSS_NOT_EVIDENCE' not in prompt


def test_evidence_budget_counts_visible_content_not_stylesheet_bytes():
    audit = core.AuditRecord.from_row({'id': 'a', 'handle': 'fixture'})
    selected = '<section><h2>Evidence</h2><p>Observed 123</p></section>'
    prompt = core.build_refinement_prompt(audit, '<style>' + 'a{color:red}' * 10000 + '</style>' + selected, 'Evidence', 'Clarify')
    assert selected in prompt and 'color:red' not in prompt
    with pytest.raises(ValueError, match='budget'):
        core.build_refinement_prompt(audit, selected + '<aside>' + 'x' * 48001 + '</aside>', 'Evidence', 'Clarify')


def test_oversized_selected_evidence_fails_instead_of_silent_truncation():
    audit = core.AuditRecord.from_row({'id': 'a', 'handle': 'fixture'})
    with pytest.raises(ValueError, match='budget'):
        core.build_refinement_prompt(audit, '<section><h2>Evidence</h2><p>' + 'x' * 100000 + '</p></section>', 'Evidence', 'Clarify')
